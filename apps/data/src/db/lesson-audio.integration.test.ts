import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sql } from 'drizzle-orm';

import {
  expectPostgresError,
  mediaAssetFixture,
  postgresErrorCode,
  useIntegrationDatabase,
} from './integration-test-database.js';
import {
  lesson,
  lessonAudio,
  lessonText,
  mediaAsset,
} from './schema.js';

const database = useIntegrationDatabase();

test('Lesson Audio requires matching localized text but upload records may remain unattached', async () => {
  const [audioLesson] = await database
    .insert(lesson)
    .values({ chapter: 20, version: 1, status: 'DRAFT' })
    .returning();
  const [readyAsset, pendingAsset, failedAsset] = await database
    .insert(mediaAsset)
    .values([
      mediaAssetFixture('audio/ready.mp3', 'READY'),
      mediaAssetFixture('audio/pending.mp3', 'PENDING'),
      mediaAssetFixture('audio/failed.mp3', 'FAILED'),
    ])
    .returning();

  await expectPostgresError(
    database.insert(lessonAudio).values({
      lessonId: audioLesson.id,
      languageCode: 'th',
      mediaAssetId: readyAsset.id,
      audioVersion: 1,
      isCurrent: true,
    }),
    postgresErrorCode.foreignKeyViolation,
  );

  await database.insert(lessonText).values({
    lessonId: audioLesson.id,
    languageCode: 'th',
    title: 'ข้อความภาษาไทย',
    content: 'เนื้อหาบทเรียนภาษาไทย',
  });
  const [createdAudio] = await database
    .insert(lessonAudio)
    .values({
      lessonId: audioLesson.id,
      languageCode: 'th',
      mediaAssetId: readyAsset.id,
      audioVersion: 1,
      isCurrent: true,
    })
    .returning();
  assert.equal(createdAudio.mediaAssetId, readyAsset.id);

  const unattachedAssets = await Promise.all(
    [pendingAsset.id, failedAsset.id].map((id) =>
      database.query.mediaAsset.findFirst({
        where: { id },
        with: { lessonAudio: true },
      }),
    ),
  );
  assert.deepEqual(
    unattachedAssets.map((asset) => asset?.lessonAudio),
    [null, null],
  );
});

test('Lesson Audio retains version history and has one current rendition per Lesson and Language', async () => {
  const [firstLesson, secondLesson] = await database
    .insert(lesson)
    .values([
      { chapter: 21, version: 1, status: 'DRAFT' },
      { chapter: 22, version: 1, status: 'DRAFT' },
    ])
    .returning();
  await database.insert(lessonText).values([
    {
      lessonId: firstLesson.id,
      languageCode: 'da',
      title: 'Dansk',
      content: 'Dansk indhold',
    },
    {
      lessonId: firstLesson.id,
      languageCode: 'en',
      title: 'English',
      content: 'English content',
    },
    {
      lessonId: secondLesson.id,
      languageCode: 'da',
      title: 'Anden lektion',
      content: 'Andet dansk indhold',
    },
  ]);
  const assets = await database
    .insert(mediaAsset)
    .values(
      Array.from({ length: 9 }, (_, index) =>
        mediaAssetFixture(`audio/history-${index + 1}.mp3`, 'READY'),
      ),
    )
    .returning();

  await database.insert(lessonAudio).values([
    {
      lessonId: firstLesson.id,
      languageCode: 'da',
      mediaAssetId: assets[0].id,
      audioVersion: 1,
      isCurrent: false,
    },
    {
      lessonId: firstLesson.id,
      languageCode: 'da',
      mediaAssetId: assets[1].id,
      audioVersion: 2,
      isCurrent: true,
    },
  ]);

  const history = await database.query.lessonAudio.findMany({
    where: { lessonId: firstLesson.id, languageCode: 'da' },
    orderBy: { audioVersion: 'asc' },
  });
  assert.deepEqual(
    history.map(({ audioVersion, isCurrent }) => ({ audioVersion, isCurrent })),
    [
      { audioVersion: 1, isCurrent: false },
      { audioVersion: 2, isCurrent: true },
    ],
  );

  await expectPostgresError(
    database.insert(lessonAudio).values({
      lessonId: firstLesson.id,
      languageCode: 'da',
      mediaAssetId: assets[2].id,
      audioVersion: 2,
    }),
    postgresErrorCode.uniqueViolation,
  );
  await expectPostgresError(
    database.insert(lessonAudio).values({
      lessonId: firstLesson.id,
      languageCode: 'da',
      mediaAssetId: assets[3].id,
      audioVersion: 0,
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(lessonAudio).values({
      lessonId: firstLesson.id,
      languageCode: 'da',
      mediaAssetId: assets[4].id,
      audioVersion: 3,
      isCurrent: true,
    }),
    postgresErrorCode.uniqueViolation,
  );

  await database.insert(lessonAudio).values([
    {
      lessonId: firstLesson.id,
      languageCode: 'en',
      mediaAssetId: assets[5].id,
      audioVersion: 1,
      isCurrent: true,
    },
    {
      lessonId: secondLesson.id,
      languageCode: 'da',
      mediaAssetId: assets[6].id,
      audioVersion: 1,
      isCurrent: true,
    },
  ]);

  await expectPostgresError(
    database.insert(lessonAudio).values({
      lessonId: firstLesson.id,
      languageCode: 'da',
      mediaAssetId: assets[0].id,
      audioVersion: 4,
    }),
    postgresErrorCode.uniqueViolation,
  );
  await expectPostgresError(
    database.execute(sql`
      insert into lesson_audio (
        lesson_id,
        language_code,
        media_asset_id,
        audio_version
      ) values (${firstLesson.id}, 'da', null, 5)
    `),
    postgresErrorCode.notNullViolation,
  );
});

test('Lesson Audio relationships resolve every navigation path unambiguously', async () => {
  const [relatedLesson] = await database
    .insert(lesson)
    .values({ chapter: 23, version: 1, status: 'PUBLISHED' })
    .returning();
  await database.insert(lessonText).values({
    lessonId: relatedLesson.id,
    languageCode: 'th',
    title: 'บทเรียน',
    content: 'เนื้อหา',
  });
  const [relatedAsset] = await database
    .insert(mediaAsset)
    .values(mediaAssetFixture('audio/relations.mp3', 'READY'))
    .returning();
  const [relatedAudio] = await database
    .insert(lessonAudio)
    .values({
      lessonId: relatedLesson.id,
      languageCode: 'th',
      mediaAssetId: relatedAsset.id,
      audioVersion: 1,
      isCurrent: true,
    })
    .returning();

  const lessonResult = await database.query.lesson.findFirst({
    where: { id: relatedLesson.id },
    with: { lessonAudios: true },
  });
  const languageResult = await database.query.language.findFirst({
    where: { code: 'th' },
    with: { lessonAudios: true },
  });
  const textResult = await database.query.lessonText.findFirst({
    where: { lessonId: relatedLesson.id, languageCode: 'th' },
    with: { lessonAudios: true },
  });
  const assetResult = await database.query.mediaAsset.findFirst({
    where: { id: relatedAsset.id },
    with: { lessonAudio: true },
  });
  const audioResult = await database.query.lessonAudio.findFirst({
    where: { id: relatedAudio.id },
    with: {
      lesson: true,
      language: true,
      lessonText: true,
      mediaAsset: true,
    },
  });

  assert.equal(lessonResult?.lessonAudios[0]?.id, relatedAudio.id);
  assert.equal(languageResult?.lessonAudios[0]?.id, relatedAudio.id);
  assert.equal(textResult?.lessonAudios[0]?.id, relatedAudio.id);
  assert.equal(assetResult?.lessonAudio?.id, relatedAudio.id);
  assert.equal(audioResult?.lesson.id, relatedLesson.id);
  assert.equal(audioResult?.language.code, 'th');
  assert.equal(audioResult?.lessonText.title, 'บทเรียน');
  assert.equal(audioResult?.mediaAsset.id, relatedAsset.id);
});
