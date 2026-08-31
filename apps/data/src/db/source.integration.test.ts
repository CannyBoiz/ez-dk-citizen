import assert from "node:assert/strict";
import { test } from "node:test";

import { eq, inArray } from "drizzle-orm";

import {
  expectPostgresError,
  postgresErrorCode,
  useIntegrationDatabase,
} from "./integration-test-database.js";
import { lesson, lessonSource, source } from "./schema.js";

const database = useIntegrationDatabase();

test("Sources are canonical and reusable across Lessons in both directions", async () => {
  const [firstLesson, secondLesson] = await database
    .insert(lesson)
    .values([
      { chapter: 10, version: 1, status: "DRAFT" },
      { chapter: 11, version: 1, status: "DRAFT" },
    ])
    .returning();
  const knownPublication = new Date("2025-01-15T12:00:00.000Z");
  const [sharedSource, additionalSource] = await database
    .insert(source)
    .values([
      {
        url: "https://example.test/canonical-source",
        publishedAt: knownPublication,
      },
      { url: "https://example.test/undated-source", publishedAt: null },
    ])
    .returning();

  await database.insert(lessonSource).values([
    { lessonId: firstLesson.id, sourceId: sharedSource.id },
    { lessonId: secondLesson.id, sourceId: sharedSource.id },
    { lessonId: firstLesson.id, sourceId: additionalSource.id },
  ]);

  assert.equal(sharedSource.publishedAt?.getTime(), knownPublication.getTime());
  assert.equal(additionalSource.publishedAt, null);
  await expectPostgresError(
    database
      .insert(source)
      .values({ url: sharedSource.url, publishedAt: null }),
    postgresErrorCode.uniqueViolation,
  );
  await expectPostgresError(
    database.insert(lessonSource).values({
      lessonId: firstLesson.id,
      sourceId: sharedSource.id,
    }),
    postgresErrorCode.uniqueViolation,
  );

  const lessonWithSources = await database.query.lesson.findFirst({
    where: { id: firstLesson.id },
    with: { lessonSources: { with: { source: true } } },
  });
  assert.deepEqual(
    lessonWithSources?.lessonSources
      .map(({ source: relatedSource }) => relatedSource.url)
      .sort(),
    [sharedSource.url, additionalSource.url].sort(),
  );

  const sourceWithLessons = await database.query.source.findFirst({
    where: { id: sharedSource.id },
    with: { lessonSources: { with: { lesson: true } } },
  });
  assert.deepEqual(
    sourceWithLessons?.lessonSources
      .map(({ lesson: relatedLesson }) => relatedLesson.chapter)
      .sort((left, right) => left - right),
    [10, 11],
  );

  await database.delete(source).where(eq(source.id, sharedSource.id));
  assert.equal(
    (
      await database
        .select()
        .from(lessonSource)
        .where(eq(lessonSource.sourceId, sharedSource.id))
    ).length,
    0,
  );
  assert.equal(
    (
      await database
        .select()
        .from(lesson)
        .where(inArray(lesson.id, [firstLesson.id, secondLesson.id]))
    ).length,
    2,
  );
});

test("Lesson Source locators accept useful partial shapes and reject invalid pages", async () => {
  const [citingLesson] = await database
    .insert(lesson)
    .values({ chapter: 12, version: 1, status: "DRAFT" })
    .returning();
  const sources = await database
    .insert(source)
    .values(
      Array.from({ length: 8 }, (_, index) => ({
        url: `https://example.test/locator-${index + 1}`,
      })),
    )
    .returning();

  await database.insert(lessonSource).values([
    { lessonId: citingLesson.id, sourceId: sources[0].id, pageFrom: 4 },
    { lessonId: citingLesson.id, sourceId: sources[1].id, pageTo: 7 },
    {
      lessonId: citingLesson.id,
      sourceId: sources[2].id,
      sectionReference: "Chapter 2, section 3",
    },
    {
      lessonId: citingLesson.id,
      sourceId: sources[3].id,
      pageFrom: 8,
      pageTo: 10,
      sectionReference: "Appendix A",
    },
    { lessonId: citingLesson.id, sourceId: sources[4].id },
  ]);

  const acceptedLocators = await database.query.lessonSource.findMany({
    where: { lessonId: citingLesson.id },
    orderBy: { sourceId: "asc" },
  });
  assert.deepEqual(
    acceptedLocators.map(({ pageFrom, pageTo, sectionReference }) => ({
      pageFrom,
      pageTo,
      sectionReference,
    })),
    [
      { pageFrom: 4, pageTo: null, sectionReference: null },
      { pageFrom: null, pageTo: 7, sectionReference: null },
      {
        pageFrom: null,
        pageTo: null,
        sectionReference: "Chapter 2, section 3",
      },
      { pageFrom: 8, pageTo: 10, sectionReference: "Appendix A" },
      { pageFrom: null, pageTo: null, sectionReference: null },
    ],
  );

  await expectPostgresError(
    database.insert(lessonSource).values({
      lessonId: citingLesson.id,
      sourceId: sources[5].id,
      pageFrom: 0,
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(lessonSource).values({
      lessonId: citingLesson.id,
      sourceId: sources[6].id,
      pageTo: -1,
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(lessonSource).values({
      lessonId: citingLesson.id,
      sourceId: sources[7].id,
      pageFrom: 9,
      pageTo: 8,
    }),
    postgresErrorCode.checkViolation,
  );
});
