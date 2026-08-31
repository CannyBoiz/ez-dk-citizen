import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';

import { eq, sql } from 'drizzle-orm';

import {
  expectPostgresError,
  integrationDatabase,
  resetIntegrationDatabase,
} from './integration-test-database.js';
import { language, lesson, lessonText } from './schema.js';

const { database, pool } = integrationDatabase;

beforeEach(resetIntegrationDatabase);
after(async () => {
  await resetIntegrationDatabase();
  await pool.end();
});

test('Lessons preserve valid versions, statuses, and database timestamps', async () => {
  const [draft] = await database
    .insert(lesson)
    .values({ chapter: 1, version: 1, status: 'DRAFT' })
    .returning();
  const [published] = await database
    .insert(lesson)
    .values({ chapter: 1, version: 2, status: 'PUBLISHED' })
    .returning();
  const [archived] = await database
    .insert(lesson)
    .values({ chapter: 1, version: 3, status: 'ARCHIVED' })
    .returning();
  await database
    .insert(lesson)
    .values([
      { chapter: 1, version: 4, status: 'DRAFT' },
      { chapter: 1, version: 5, status: 'ARCHIVED' },
    ]);

  assert.equal(draft.status, 'DRAFT');
  assert.equal(published.status, 'PUBLISHED');
  assert.equal(archived.status, 'ARCHIVED');
  assert.ok(draft.createdAt instanceof Date);
  assert.ok(draft.updatedAt instanceof Date);

  const explicitlyAdvancedAt = new Date(draft.updatedAt.getTime() + 60_000);
  const [updated] = await database
    .update(lesson)
    .set({ status: 'ARCHIVED', updatedAt: explicitlyAdvancedAt })
    .where(eq(lesson.id, draft.id))
    .returning();

  assert.equal(updated.updatedAt.getTime(), explicitlyAdvancedAt.getTime());
});

test('PostgreSQL rejects invalid or conflicting Lesson versions', async () => {
  await expectPostgresError(
    database.insert(lesson).values({ chapter: 0, version: 1, status: 'DRAFT' }),
    '23514',
  );
  await expectPostgresError(
    database.insert(lesson).values({ chapter: 1, version: 0, status: 'DRAFT' }),
    '23514',
  );

  await database
    .insert(lesson)
    .values({ chapter: 2, version: 1, status: 'DRAFT' });
  await expectPostgresError(
    database.insert(lesson).values({ chapter: 2, version: 1, status: 'ARCHIVED' }),
    '23505',
  );

  await database
    .insert(lesson)
    .values({ chapter: 3, version: 1, status: 'PUBLISHED' });
  await expectPostgresError(
    database.insert(lesson).values({ chapter: 3, version: 2, status: 'PUBLISHED' }),
    '23505',
  );
  await database
    .insert(lesson)
    .values({ chapter: 4, version: 1, status: 'PUBLISHED' });
});

test('Languages and localized Lesson Texts retain complete unique identities', async () => {
  const exactLengthLanguageCode = 'en-Latn-US-x-abcdefg-hijklmn-opqrst';
  assert.equal(exactLengthLanguageCode.length, 35);

  const [localizedLesson] = await database
    .insert(lesson)
    .values({ chapter: 5, version: 1, status: 'DRAFT' })
    .returning();
  await database
    .insert(language)
    .values({ code: exactLengthLanguageCode, name: 'Long BCP 47 example' });
  await database.insert(lessonText).values({
    lessonId: localizedLesson.id,
    languageCode: exactLengthLanguageCode,
    title: 'A complete title',
    content: 'A complete body',
  });

  const seededLanguages = await database.query.language.findMany({
    where: { code: { in: ['da', 'en', 'th'] } },
    orderBy: { code: 'asc' },
  });
  assert.deepEqual(
    seededLanguages.map(({ code, name }) => ({ code, name })),
    [
      { code: 'da', name: 'Danish' },
      { code: 'en', name: 'English' },
      { code: 'th', name: 'Thai' },
    ],
  );

  await expectPostgresError(
    database
      .insert(language)
      .values({ code: exactLengthLanguageCode, name: 'Duplicate code' }),
    '23505',
  );
  await expectPostgresError(
    database.insert(language).values({ code: 'de', name: 'Danish' }),
    '23505',
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: exactLengthLanguageCode,
      title: 'Duplicate',
      content: 'Duplicate',
    }),
    '23505',
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id + 999,
      languageCode: 'da',
      title: 'Missing Lesson',
      content: 'Rejected',
    }),
    '23503',
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: 'missing',
      title: 'Missing Language',
      content: 'Rejected',
    }),
    '23503',
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: 'da',
      title: '   ',
      content: 'Rejected',
    }),
    '23514',
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: 'da',
      title: '',
      content: 'Rejected',
    }),
    '23514',
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: 'en',
      title: 'Rejected',
      content: '',
    }),
    '23514',
  );
  await expectPostgresError(
    database.insert(lessonText).values({
      lessonId: localizedLesson.id,
      languageCode: 'en',
      title: 'Rejected',
      content: '   ',
    }),
    '23514',
  );
  await expectPostgresError(
    database.execute(sql`
      insert into lesson_text (lesson_id, language_code, title, content)
      values (${localizedLesson.id}, 'th', null, 'Rejected')
    `),
    '23502',
  );
  await expectPostgresError(
    database.execute(sql`
      insert into lesson_text (lesson_id, language_code, title, content)
      values (${localizedLesson.id}, 'th', 'Rejected', null)
    `),
    '23502',
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
    '23001',
  );
});
