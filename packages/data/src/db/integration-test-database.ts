import assert from "node:assert/strict";
import { after, beforeEach } from "node:test";

import { sql } from "drizzle-orm";

import { createDataDatabase, requireDatabaseUrl } from "./database.js";

const { database, pool } = createDataDatabase(requireDatabaseUrl());

export const postgresErrorCode = {
  checkViolation: "23514",
  foreignKeyViolation: "23503",
  invalidTextRepresentation: "22P02",
  notNullViolation: "23502",
  restrictViolation: "23001",
  uniqueViolation: "23505",
} as const;

type PostgresErrorCode =
  (typeof postgresErrorCode)[keyof typeof postgresErrorCode];

export function useIntegrationDatabase() {
  beforeEach(resetIntegrationDatabase);
  after(async () => {
    await resetIntegrationDatabase();
    await pool.end();
  });

  return database;
}

export function mediaAssetFixture(
  objectKey: string,
  status: "PENDING" | "READY" | "FAILED" | "DELETED",
) {
  const completedUpload =
    status === "READY"
      ? {
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          uploadedAt: new Date("2026-01-01T00:01:00.000Z"),
        }
      : {};

  return {
    storageProvider: "s3",
    storageContainer: "citizenship-audio",
    objectKey,
    originalFilename: objectKey.split("/").at(-1) ?? objectKey,
    contentType: "audio/mpeg",
    sizeBytes: 1_024n,
    status,
    ...completedUpload,
  };
}

export async function resetIntegrationDatabase(): Promise<void> {
  await database.execute(sql`
    truncate table
      lesson_audio,
      lesson_source,
      lesson_text,
      media_asset,
      source,
      lesson
    restart identity cascade
  `);
  await database.execute(sql`
    delete from language where code not in ('da', 'en', 'th')
  `);
}

export async function expectPostgresError(
  operation: Promise<unknown>,
  expectedCode: PostgresErrorCode,
): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.equal(findPostgresErrorCode(error), expectedCode);
    return true;
  });
}

function findPostgresErrorCode(error: unknown): string | undefined {
  let candidate = error;

  while (candidate && typeof candidate === "object") {
    if ("code" in candidate && typeof candidate.code === "string") {
      return candidate.code;
    }

    candidate = "cause" in candidate ? candidate.cause : undefined;
  }

  return undefined;
}
