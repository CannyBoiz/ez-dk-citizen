import assert from "node:assert/strict";
import { test } from "node:test";

import { createS3Storage } from "./storage.js";

test("S3 upload authorization signs all declared write constraints", async () => {
  const authorization = await createS3Storage({
    region: "eu-north-1",
    bucket: "citizenship-audio",
    accessKeyId: "test-access-key-id",
    secretAccessKey: "test-secret-access-key",
  }).createUploadAuthorization({
    key: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 1,
  });

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
  assert.ok(Date.parse(authorization.expiresAt) > Date.now() + 14 * 60 * 1_000);
});

test("S3 playback authorization is a one-hour object read", async () => {
  const authorization = await createS3Storage({
    region: "eu-north-1",
    bucket: "citizenship-audio",
    accessKeyId: "test-access-key-id",
    secretAccessKey: "test-secret-access-key",
  }).createPlaybackAuthorization(
    "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
  );

  assert.equal(
    new URL(authorization.playbackUrl).searchParams.get("X-Amz-Expires"),
    "3600",
  );
  assert.ok(Date.parse(authorization.expiresAt) > Date.now() + 59 * 60 * 1_000);
});
