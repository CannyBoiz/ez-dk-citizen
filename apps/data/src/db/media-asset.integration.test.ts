import assert from 'node:assert/strict';
import { test } from 'node:test';

import { eq, sql } from 'drizzle-orm';

import {
  expectPostgresError,
  mediaAssetFixture,
  postgresErrorCode,
  useIntegrationDatabase,
} from './integration-test-database.js';
import { mediaAsset } from './schema.js';

const database = useIntegrationDatabase();

test('Media Assets represent pending and completed upload metadata', async () => {
  const [pendingAsset] = await database
    .insert(mediaAsset)
    .values({
      storageProvider: 's3',
      storageContainer: 'citizenship-audio',
      objectKey: 'pending/audio.ogg',
      originalFilename: 'lesson-audio.ogg',
      contentType: 'audio/ogg',
      sizeBytes: 4_096n,
      durationMs: null,
    })
    .returning();

  assert.equal(pendingAsset.status, 'PENDING');
  assert.ok(pendingAsset.createdAt instanceof Date);
  assert.equal(pendingAsset.uploadedAt, null);
  assert.equal(pendingAsset.durationMs, null);

  const pendingWithAudio = await database.query.mediaAsset.findFirst({
    where: { id: pendingAsset.id },
    with: { lessonAudio: true },
  });
  assert.equal(pendingWithAudio?.lessonAudio, null);

  const uploadedAt = new Date(pendingAsset.createdAt.getTime() + 30_000);
  const [readyAsset] = await database
    .update(mediaAsset)
    .set({ status: 'READY', uploadedAt, durationMs: 123_000n })
    .where(eq(mediaAsset.id, pendingAsset.id))
    .returning();
  assert.equal(readyAsset.status, 'READY');
  assert.equal(readyAsset.uploadedAt?.getTime(), uploadedAt.getTime());
  assert.equal(readyAsset.createdAt.getTime(), pendingAsset.createdAt.getTime());
  assert.equal(readyAsset.durationMs, 123_000n);

  const statusRows = await database
    .insert(mediaAsset)
    .values([
      mediaAssetFixture('failed/audio.bin', 'FAILED'),
      mediaAssetFixture('deleted/audio.bin', 'DELETED'),
    ])
    .returning({ status: mediaAsset.status });
  assert.deepEqual(
    statusRows.map(({ status }) => status),
    ['FAILED', 'DELETED'],
  );

  await expectPostgresError(
    database.execute(sql`
      insert into media_asset (
        storage_provider,
        storage_container,
        object_key,
        original_filename,
        content_type,
        size_bytes,
        status
      ) values ('s3', 'citizenship-audio', 'invalid-status', 'invalid', 'audio/mpeg', 1, 'UPLOADING')
    `),
    postgresErrorCode.invalidTextRepresentation,
  );
});

test('Media Asset identity is provider-neutral and unique per stored object', async () => {
  const stableObject = mediaAssetFixture('lessons/chapter-1.mp3', 'READY');
  await database.insert(mediaAsset).values(stableObject);

  await expectPostgresError(
    database.insert(mediaAsset).values({
      ...stableObject,
      originalFilename: 'same-object-renamed.mp3',
    }),
    postgresErrorCode.uniqueViolation,
  );
  await database.insert(mediaAsset).values([
    { ...stableObject, storageProvider: 'azure' },
    { ...stableObject, storageContainer: 'another-container' },
  ]);
});

test('Media Asset metadata rejects unusable values without restricting MIME type', async () => {
  await database.insert(mediaAsset).values({
    ...mediaAssetFixture('documents/transcript.pdf', 'READY'),
    contentType: 'application/pdf',
    sizeBytes: 25n,
    durationMs: null,
  });

  await expectPostgresError(
    database.insert(mediaAsset).values({
      ...mediaAssetFixture('invalid/zero-size', 'PENDING'),
      sizeBytes: 0n,
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(mediaAsset).values({
      ...mediaAssetFixture('invalid/negative-size', 'PENDING'),
      sizeBytes: -1n,
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(mediaAsset).values({
      ...mediaAssetFixture('invalid/zero-duration', 'PENDING'),
      durationMs: 0n,
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(mediaAsset).values({
      ...mediaAssetFixture('invalid/negative-duration', 'PENDING'),
      durationMs: -1n,
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(mediaAsset).values({
      ...mediaAssetFixture('invalid/blank-content-type', 'PENDING'),
      contentType: '   ',
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.insert(mediaAsset).values({
      ...mediaAssetFixture('invalid/empty-content-type', 'PENDING'),
      contentType: '',
    }),
    postgresErrorCode.checkViolation,
  );
  await expectPostgresError(
    database.execute(sql`
      insert into media_asset (
        storage_provider,
        storage_container,
        object_key,
        original_filename,
        content_type,
        size_bytes
      ) values ('s3', 'citizenship-audio', 'invalid/null-content-type', 'invalid', null, 1)
    `),
    postgresErrorCode.notNullViolation,
  );
});
