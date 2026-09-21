import assert from "node:assert/strict";
import { test } from "node:test";

import { createS3Storage } from "./storage.js";

test("S3 upload authorization uses the standard credential chain", async () => {
  await withTestCredentials(async () => {
    const authorization = await createS3Storage({
      region: "eu-north-1",
      bucket: "citizenship-audio",
    }).createUploadAuthorization({
      key: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    });

    assert.match(
      new URL(authorization.uploadUrl).searchParams.get("X-Amz-Credential") ??
        "",
      /^test-access-key-id\//,
    );
    assert.deepEqual(
      new URL(authorization.uploadUrl).searchParams
        .get("X-Amz-SignedHeaders")
        ?.split(";")
        .sort(),
      ["content-length", "content-type", "host", "if-none-match"],
    );
    assert.deepEqual(authorization.uploadHeaders, {
      "Content-Type": "audio/mpeg",
      "Content-Length": "1",
      "If-None-Match": "*",
    });
    assert.ok(
      Date.parse(authorization.expiresAt) > Date.now() + 14 * 60 * 1_000,
    );
  });
});

test("S3 playback authorization is a one-hour object read", async () => {
  await withTestCredentials(async () => {
    const authorization = await createS3Storage({
      region: "eu-north-1",
      bucket: "citizenship-audio",
    }).createPlaybackAuthorization(
      "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
    );

    assert.equal(
      new URL(authorization.playbackUrl).searchParams.get("X-Amz-Expires"),
      "3600",
    );
    assert.ok(
      Date.parse(authorization.expiresAt) > Date.now() + 59 * 60 * 1_000,
    );
  });
});

async function withTestCredentials(run: () => Promise<void>) {
  const previous = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
  process.env.AWS_ACCESS_KEY_ID = "test-access-key-id";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret-access-key";
  try {
    await run();
  } finally {
    restoreEnvironment("AWS_ACCESS_KEY_ID", previous.accessKeyId);
    restoreEnvironment("AWS_SECRET_ACCESS_KEY", previous.secretAccessKey);
  }
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
