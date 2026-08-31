import assert from 'node:assert/strict';
import { test } from 'node:test';

import { eq } from 'drizzle-orm';

import {
  expectPostgresError,
  mediaAssetFixture,
  postgresErrorCode,
  useIntegrationDatabase,
} from './integration-test-database.js';
import {
  language,
  lesson,
  lessonAudio,
  lessonSource,
  lessonText,
  mediaAsset,
  source,
} from './schema.js';

const database = useIntegrationDatabase();

test('A representative Lesson graph loads bidirectionally through Drizzle', async () => {
  const [primaryLesson, reuseLesson] = await database
    .insert(lesson)
    .values([
      { chapter: 30, version: 1, status: 'PUBLISHED' },
      { chapter: 31, version: 1, status: 'DRAFT' },
    ])
    .returning();
  await database.insert(lessonText).values([
    {
      lessonId: primaryLesson.id,
      languageCode: 'da',
      title: 'Dansk titel',
      content: 'Dansk indhold',
    },
    {
      lessonId: primaryLesson.id,
      languageCode: 'th',
      title: 'ชื่อภาษาไทย',
      content: 'เนื้อหาภาษาไทย',
    },
  ]);
  const [sharedSource] = await database
    .insert(source)
    .values({ url: 'https://example.test/shared-official-source' })
    .returning();
  await database.insert(lessonSource).values([
    { lessonId: primaryLesson.id, sourceId: sharedSource.id, pageFrom: 3 },
    { lessonId: reuseLesson.id, sourceId: sharedSource.id },
  ]);
  const [historicalAsset, currentAsset, pendingAsset] = await database
    .insert(mediaAsset)
    .values([
      mediaAssetFixture('graph/historical.mp3', 'READY'),
      mediaAssetFixture('graph/current.mp3', 'READY'),
      mediaAssetFixture('graph/pending.mp3', 'PENDING'),
    ])
    .returning();
  await database.insert(lessonAudio).values([
    {
      lessonId: primaryLesson.id,
      languageCode: 'th',
      mediaAssetId: historicalAsset.id,
      audioVersion: 1,
      isCurrent: false,
    },
    {
      lessonId: primaryLesson.id,
      languageCode: 'th',
      mediaAssetId: currentAsset.id,
      audioVersion: 2,
      isCurrent: true,
    },
  ]);

  const graph = await database.query.lesson.findFirst({
    where: { id: primaryLesson.id },
    with: {
      lessonTexts: { with: { language: true, lessonAudios: true } },
      lessonSources: { with: { source: true } },
      lessonAudios: { with: { lessonText: true, mediaAsset: true } },
    },
  });
  const reverseSource = await database.query.source.findFirst({
    where: { id: sharedSource.id },
    with: { lessonSources: { with: { lesson: true } } },
  });
  const pending = await database.query.mediaAsset.findFirst({
    where: { id: pendingAsset.id },
    with: { lessonAudio: true },
  });

  assert.equal(graph?.lessonTexts.length, 2);
  assert.equal(graph?.lessonSources[0]?.source.id, sharedSource.id);
  assert.deepEqual(
    graph?.lessonAudios.map(({ audioVersion }) => audioVersion).sort(),
    [1, 2],
  );
  assert.equal(graph?.lessonAudios[0]?.lessonText.languageCode, 'th');
  assert.equal(graph?.lessonAudios[0]?.mediaAsset.status, 'READY');
  assert.deepEqual(
    reverseSource?.lessonSources
      .map(({ lesson: relatedLesson }) => relatedLesson.chapter)
      .sort((left, right) => left - right),
    [30, 31],
  );
  assert.equal(pending?.lessonAudio, null);
});

test('Deleting a Lesson removes owned associations but preserves shared parents', async () => {
  const [ownedLesson] = await database
    .insert(lesson)
    .values({ chapter: 32, version: 1, status: 'DRAFT' })
    .returning();
  await database.insert(lessonText).values({
    lessonId: ownedLesson.id,
    languageCode: 'da',
    title: 'Owned text',
    content: 'Owned body',
  });
  const [sharedSource] = await database
    .insert(source)
    .values({ url: 'https://example.test/preserved-source' })
    .returning();
  await database
    .insert(lessonSource)
    .values({ lessonId: ownedLesson.id, sourceId: sharedSource.id });
  const [preservedAsset] = await database
    .insert(mediaAsset)
    .values(mediaAssetFixture('deletion/preserved.mp3', 'READY'))
    .returning();
  await database.insert(lessonAudio).values({
    lessonId: ownedLesson.id,
    languageCode: 'da',
    mediaAssetId: preservedAsset.id,
    audioVersion: 1,
    isCurrent: true,
  });

  await database.delete(lesson).where(eq(lesson.id, ownedLesson.id));

  assert.equal(
    (
      await database
        .select()
        .from(lessonText)
        .where(eq(lessonText.lessonId, ownedLesson.id))
    ).length,
    0,
  );
  assert.equal(
    (
      await database
        .select()
        .from(lessonSource)
        .where(eq(lessonSource.lessonId, ownedLesson.id))
    ).length,
    0,
  );
  assert.equal(
    (
      await database
        .select()
        .from(lessonAudio)
        .where(eq(lessonAudio.lessonId, ownedLesson.id))
    ).length,
    0,
  );
  assert.equal(
    (await database.select().from(source).where(eq(source.id, sharedSource.id))).length,
    1,
  );
  assert.equal(
    (
      await database
        .select()
        .from(mediaAsset)
        .where(eq(mediaAsset.id, preservedAsset.id))
    ).length,
    1,
  );
});

test('Restricted parents remain protected and deleting audio preserves its Media Asset', async () => {
  const [protectedLesson] = await database
    .insert(lesson)
    .values({ chapter: 33, version: 1, status: 'DRAFT' })
    .returning();
  await database.insert(lessonText).values({
    lessonId: protectedLesson.id,
    languageCode: 'en',
    title: 'Protected graph',
    content: 'Protected content',
  });
  const [protectedAsset] = await database
    .insert(mediaAsset)
    .values(mediaAssetFixture('deletion/protected.mp3', 'READY'))
    .returning();
  const [audio] = await database
    .insert(lessonAudio)
    .values({
      lessonId: protectedLesson.id,
      languageCode: 'en',
      mediaAssetId: protectedAsset.id,
      audioVersion: 1,
      isCurrent: true,
    })
    .returning();

  await expectPostgresError(
    database.delete(language).where(eq(language.code, 'en')),
    postgresErrorCode.restrictViolation,
  );
  await expectPostgresError(
    database.delete(mediaAsset).where(eq(mediaAsset.id, protectedAsset.id)),
    postgresErrorCode.restrictViolation,
  );

  await database.delete(lessonAudio).where(eq(lessonAudio.id, audio.id));
  assert.equal(
    (
      await database
        .select()
        .from(mediaAsset)
        .where(eq(mediaAsset.id, protectedAsset.id))
    ).length,
    1,
  );
});
