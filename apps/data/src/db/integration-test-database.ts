import assert from 'node:assert/strict';

import { sql } from 'drizzle-orm';

import { createDataDatabase, requireDatabaseUrl } from './database.js';

export const integrationDatabase = createDataDatabase(requireDatabaseUrl());

export function mediaAssetFixture(
  objectKey: string,
  status: 'PENDING' | 'READY' | 'FAILED' | 'DELETED',
) {
  return {
    storageProvider: 's3',
    storageContainer: 'citizenship-audio',
    objectKey,
    originalFilename: objectKey.split('/').at(-1) ?? objectKey,
    contentType: 'audio/mpeg',
    sizeBytes: 1_024n,
    status,
  };
}

export async function resetIntegrationDatabase(): Promise<void> {
  await integrationDatabase.database.execute(sql`
    truncate table
      lesson_audio,
      lesson_source,
      lesson_text,
      media_asset,
      source,
      lesson
    restart identity cascade
  `);
  await integrationDatabase.database.execute(sql`
    delete from language where code not in ('da', 'en', 'th')
  `);
}

export async function expectPostgresError(
  operation: Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.equal(findPostgresErrorCode(error), expectedCode);
    return true;
  });
}

function findPostgresErrorCode(error: unknown): string | undefined {
  let candidate = error;

  while (candidate && typeof candidate === 'object') {
    if ('code' in candidate && typeof candidate.code === 'string') {
      return candidate.code;
    }

    candidate = 'cause' in candidate ? candidate.cause : undefined;
  }

  return undefined;
}
