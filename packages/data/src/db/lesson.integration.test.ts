import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import { eq, sql } from "drizzle-orm";

import { createDataOperations } from "../data-operations.js";
import { patchLesson } from "../features/lessons/mutations.js";
import { fail, ok } from "../outcome.js";
import {
  expectPostgresError,
  postgresErrorCode,
  useIntegrationDatabase,
} from "./integration-test-database.js";
import {
  language,
  lesson,
  lessonSource,
  lessonText,
  source,
} from "./schema.js";

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

// A Lesson with a Thai Lesson Text and one Lesson Source, so it meets the publication
// prerequisites.
async function publishableLesson(
  values: typeof lesson.$inferInsert,
  content: string,
) {
  const [cited] = await database
    .insert(source)
    .values({ url: `https://example.test/${values.chapter}/${content}` })
    .returning();
  const [created] = await database.insert(lesson).values(values).returning();
  await database
    .insert(lessonText)
    .values({ lessonId: created.id, languageCode: "th", title: "บท", content });
  await database
    .insert(lessonSource)
    .values({ lessonId: created.id, sourceId: cited.id });
  return created;
}

test("a replacement that fails partway leaves both Lessons as they were", async () => {
  const published = await publishableLesson(
    { chapter: 30, version: 1, versionPatch: 0, status: "PUBLISHED" },
    "เดิม",
  );
  const draft = await publishableLesson(
    { chapter: 30, status: "DRAFT" },
    "ใหม่",
  );
  const snapshot = async () => ({
    lessons: await database.select().from(lesson).orderBy(lesson.id),
    texts: await database
      .select()
      .from(lessonText)
      .orderBy(lessonText.lessonId, lessonText.languageCode),
  });
  const before = await snapshot();
  // The replacement completes, with a Lesson Text of its own, then the transaction fails.
  const failingDatabase = new Proxy(database, {
    get(target, property, receiver) {
      if (property !== "transaction") {
        return Reflect.get(target, property, receiver);
      }
      return (callback: Parameters<typeof database.transaction>[0]) =>
        target.transaction(async (transaction) => {
          assert.deepEqual(await callback(transaction), ok(draft.id));
          throw new Error("forced rollback");
        });
    },
  });

  await assert.rejects(
    patchLesson(failingDatabase, draft.id, {
      status: "PUBLISHED",
      changeKind: "fix",
      replacesLessonId: published.id,
      text: { languageCode: "da", title: "Titel", content: "Indhold" },
    }),
    /forced rollback/,
  );

  assert.deepEqual(await snapshot(), before);
});

test("a publication whose version a concurrent publication took meanwhile is lesson_version_conflict and changes nothing", async () => {
  const operations = createDataOperations(database);
  const slow = await publishableLesson({ chapter: 31, status: "DRAFT" }, "ช้า");
  const fast = await publishableLesson({ chapter: 31, status: "DRAFT" }, "เร็ว");
  const before = await operations.getLesson(slow.id);

  // Holds the slow publication at its Lesson Text write, after it has given itself 1.0.
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  let locked!: () => void;
  const isLocked = new Promise<void>((resolve) => (locked = resolve));
  const holder = database.transaction(async (transaction) => {
    await transaction
      .select()
      .from(lessonText)
      .where(eq(lessonText.lessonId, slow.id))
      .for("update");
    locked();
    await released;
  });
  await isLocked;
  const slowPublication = operations.patchLesson(slow.id, {
    status: "PUBLISHED",
    text: { languageCode: "th", title: "บท", content: "ช้ากว่า" },
  });
  await waitForLockWait();

  // Meanwhile another Draft of the chapter is published as 1.0 and archived.
  for (const status of ["PUBLISHED", "ARCHIVED"] as const) {
    const changed = await operations.patchLesson(fast.id, { status });
    assert.ok(changed.ok);
    assert.equal(changed.value.status, status);
  }
  release();
  await holder;

  assert.deepEqual(await slowPublication, fail("lesson_version_conflict"));
  assert.deepEqual(await operations.getLesson(slow.id), before);
});

// Waits until a statement in this database is blocked on a lock.
async function waitForLockWait() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const { rows } = await database.execute<{ waiting: number }>(sql`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event_type = 'Lock'
    `);
    if (rows[0]?.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("No statement waited on a lock.");
}
