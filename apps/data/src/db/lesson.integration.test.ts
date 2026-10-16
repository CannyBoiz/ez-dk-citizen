import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { eq, sql } from "drizzle-orm";

import {
  expectPostgresError,
  postgresErrorCode,
  useIntegrationDatabase,
} from "./integration-test-database.js";
import { language, lesson, lessonText } from "./schema.js";

const database = useIntegrationDatabase();

test("Lessons preserve valid versions, statuses, and database timestamps", async () => {
  const [draft] = await database
    .insert(lesson)
    .values({ chapter: 1, status: "DRAFT" })
    .returning();
  const [published] = await database
    .insert(lesson)
    .values({ chapter: 1, version: 2, versionPatch: 1, status: "PUBLISHED" })
    .returning();
  const [archived] = await database
    .insert(lesson)
    .values({ chapter: 1, version: 3, versionPatch: 0, status: "ARCHIVED" })
    .returning();
  await database.insert(lesson).values([
    { chapter: 1, status: "DRAFT" },
    { chapter: 1, version: 1, versionPatch: 10, status: "ARCHIVED" },
  ]);

  assert.deepEqual(
    [draft, published, archived].map(({ version, versionPatch, status }) => ({
      version,
      versionPatch,
      status,
    })),
    [
      { version: null, versionPatch: null, status: "DRAFT" },
      { version: 2, versionPatch: 1, status: "PUBLISHED" },
      { version: 3, versionPatch: 0, status: "ARCHIVED" },
    ],
  );
  assert.ok(draft.createdAt instanceof Date);
  assert.ok(draft.updatedAt instanceof Date);

  const explicitlyAdvancedAt = new Date(draft.updatedAt.getTime() + 60_000);
  const [updated] = await database
    .update(lesson)
    .set({ chapter: 2, updatedAt: explicitlyAdvancedAt })
    .where(eq(lesson.id, draft.id))
    .returning();

  assert.equal(updated.updatedAt.getTime(), explicitlyAdvancedAt.getTime());
});

test("PostgreSQL rejects invalid or conflicting Lesson versions", async () => {
  for (const invalid of [
    { chapter: 0, status: "DRAFT" },
    { chapter: 1, version: 0, versionPatch: 0, status: "PUBLISHED" },
    { chapter: 1, version: 1, versionPatch: -1, status: "PUBLISHED" },
    { chapter: 1, version: 1, status: "PUBLISHED" },
    { chapter: 1, versionPatch: 0, status: "ARCHIVED" },
    { chapter: 1, status: "PUBLISHED" },
    { chapter: 1, status: "ARCHIVED" },
    { chapter: 1, version: 1, versionPatch: 0, status: "DRAFT" },
  ] as const) {
    await expectPostgresError(
      database.insert(lesson).values(invalid),
      postgresErrorCode.checkViolation,
    );
  }

  await database.insert(lesson).values([
    { chapter: 2, status: "DRAFT" },
    { chapter: 2, status: "DRAFT" },
    { chapter: 2, version: 1, versionPatch: 0, status: "ARCHIVED" },
    { chapter: 2, version: 1, versionPatch: 1, status: "ARCHIVED" },
    { chapter: 3, version: 1, versionPatch: 0, status: "ARCHIVED" },
  ]);
  await expectPostgresError(
    database
      .insert(lesson)
      .values({ chapter: 2, version: 1, versionPatch: 1, status: "PUBLISHED" }),
    postgresErrorCode.uniqueViolation,
  );

  await database
    .insert(lesson)
    .values({ chapter: 4, version: 1, versionPatch: 0, status: "PUBLISHED" });
  await expectPostgresError(
    database
      .insert(lesson)
      .values({ chapter: 4, version: 2, versionPatch: 0, status: "PUBLISHED" }),
    postgresErrorCode.uniqueViolation,
  );
});

test("the Stage 4b migration keeps versions N as N.0 after publication and clears them on Drafts", async () => {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  const migrations = (await readdir(migrationsFolder)).sort();
  const target = migrations.find((name) =>
    name.endsWith("_give_versions_at_publication"),
  );
  assert.ok(target, "The Stage 4b migration was not found.");
  const apply = async (
    transaction: Parameters<Parameters<typeof database.transaction>[0]>[0],
    name: string,
  ) => {
    const migration = await readFile(
      path.join(migrationsFolder, name, "migration.sql"),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) await transaction.execute(sql.raw(statement));
    }
  };
  const rolledBack = new Error("roll back the scratch schema");

  // Replays the migrations in a scratch schema inside one transaction, which is then rolled back.
  await assert.rejects(
    database.transaction(async (transaction) => {
      await transaction.execute(sql`create schema stage_4b_migration`);
      await transaction.execute(
        sql`set local search_path to stage_4b_migration`,
      );
      // Migration folders sort by their timestamp prefix.
      for (const name of migrations.filter((name) => name < target)) {
        await apply(transaction, name);
      }
      await transaction.execute(sql`
        insert into lesson (chapter, version, status) values
          (1, 1, 'ARCHIVED'),
          (1, 2, 'PUBLISHED'),
          (1, 3, 'DRAFT'),
          (2, 1, 'DRAFT'),
          (2, 2, 'ARCHIVED')
      `);
      await apply(transaction, target);

      const { rows } = await transaction.execute<{
        chapter: number;
        version: number | null;
        version_patch: number | null;
        status: string;
      }>(sql`
        select chapter, version, version_patch, status from lesson order by id
      `);
      assert.deepEqual(rows, [
        { chapter: 1, version: 1, version_patch: 0, status: "ARCHIVED" },
        { chapter: 1, version: 2, version_patch: 0, status: "PUBLISHED" },
        { chapter: 1, version: null, version_patch: null, status: "DRAFT" },
        { chapter: 2, version: null, version_patch: null, status: "DRAFT" },
        // Archived as a Draft before Stage 4b: it keeps its version and status.
        { chapter: 2, version: 2, version_patch: 0, status: "ARCHIVED" },
      ]);
      throw rolledBack;
    }),
    (error) => error === rolledBack,
  );
});

test("Languages and localized Lesson Texts retain complete unique identities", async () => {
  const exactLengthLanguageCode = "en-Latn-US-x-abcdefg-hijklmn-opqrst";
  assert.equal(exactLengthLanguageCode.length, 35);

  const [localizedLesson] = await database
    .insert(lesson)
    .values({ chapter: 5, status: "DRAFT" })
    .returning();
  await database
    .insert(language)
    .values({ code: exactLengthLanguageCode, name: "Long BCP 47 example" });
  await database.insert(lessonText).values({
    lessonId: localizedLesson.id,
    languageCode: exactLengthLanguageCode,
    title: "A complete title",
    content: "A complete body",
  });

  const seededLanguages = await database.query.language.findMany({
    where: { code: { in: ["da", "en", "th"] } },
    orderBy: { code: "asc" },
  });
  assert.deepEqual(
    seededLanguages.map(({ code, name }) => ({ code, name })),
    [
      { code: "da", name: "Danish" },
      { code: "en", name: "English" },
      { code: "th", name: "Thai" },
    ],
  );

  await expectPostgresError(
    database
      .insert(language)
      .values({ code: exactLengthLanguageCode, name: "Duplicate code" }),
    postgresErrorCode.uniqueViolation,
  );
  await expectPostgresError(
    database.insert(language).values({ code: "de", name: "Danish" }),
    postgresErrorCode.uniqueViolation,
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: exactLengthLanguageCode,
      title: "Duplicate",
      content: "Duplicate",
    }),
    postgresErrorCode.uniqueViolation,
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id + 999,
      languageCode: "da",
      title: "Missing Lesson",
      content: "Rejected",
    }),
    postgresErrorCode.foreignKeyViolation,
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: "missing",
      title: "Missing Language",
      content: "Rejected",
    }),
    postgresErrorCode.foreignKeyViolation,
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: "da",
      title: "   ",
      content: "Rejected",
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: "da",
      title: "",
      content: "Rejected",
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: "en",
      title: "Rejected",
      content: "",
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: "en",
      title: "Rejected",
      content: "   ",
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.execute(sql`
      insert into lesson_text (lesson_id, language_code, title, content)
      values (${localizedLesson.id}, 'th', null, 'Rejected')
    `),
    postgresErrorCode.notNullViolation,
  );
  await expectPostgresError(
    database.execute(sql`
      insert into lesson_text (lesson_id, language_code, title, content)
      values (${localizedLesson.id}, 'th', 'Rejected', null)
    `),
    postgresErrorCode.notNullViolation,
  );

  const lessonWithTexts = await database.query.lesson.findFirst({
    where: { id: localizedLesson.id },
    with: { lessonTexts: { with: { lesson: true, language: true } } },
  });
  assert.equal(lessonWithTexts?.lessonTexts[0]?.lesson.id, localizedLesson.id);
  assert.equal(
    lessonWithTexts?.lessonTexts[0]?.language.code,
    exactLengthLanguageCode,
  );

  const languageWithTexts = await database.query.language.findFirst({
    where: { code: exactLengthLanguageCode },
    with: { lessonTexts: true },
  });
  assert.equal(languageWithTexts?.lessonTexts[0]?.lessonId, localizedLesson.id);

  await expectPostgresError(
    database.delete(language).where(eq(language.code, exactLengthLanguageCode)),
    postgresErrorCode.restrictViolation,
  );
});
