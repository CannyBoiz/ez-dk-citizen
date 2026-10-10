import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mediaAssetResponseSchema,
  problemDetailsSchema,
} from "@ez-dk-citizen/api-contracts";

import { createBffApp } from "../../app.js";
import { DataServiceError } from "../../data-service/client.js";
import { FakeStorage } from "../../storage.js";
import { createTestDataServiceClient } from "../../testing/data-service-client.js";

test("BFF creates a pending Media Asset before a signed MP3 Upload Intent", async () => {
  const storage = new FakeStorage();
  const calls: string[] = [];
  const createUploadAuthorization =
    storage.createUploadAuthorization.bind(storage);
  storage.createUploadAuthorization = async (input) => {
    calls.push("sign");
    return createUploadAuthorization(input);
  };
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    storageBucket: "citizenship-audio",
    dataServiceClient: createTestDataServiceClient({
      async createPendingMediaAsset(input, requestId) {
        calls.push(`persist:${requestId}`);
        assert.equal(input.languageCode, "th");
        assert.equal(input.storageContainer, "citizenship-audio");
        assert.match(input.objectKey, /^audio\/[0-9a-f-]{36}\.mp3$/);
        const { languageCode: _languageCode, ...mediaAsset } = input;
        return mediaAssetResponseSchema.parse({
          id: 9,
          ...mediaAsset,
          status: "PENDING",
          durationMs: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          uploadedAt: null,
        });
      },
    }),
  });

  const response = await app.request("/api/admin/media/upload-intents", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "upload-request",
    },
    body: JSON.stringify({
      lessonId: 7,
      languageCode: "th",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 50 * 1024 * 1024,
    }),
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("x-request-id"), "upload-request");
  const intent = await response.json();
  assert.deepEqual(Object.keys(intent).sort(), [
    "expiresAt",
    "mediaAssetId",
    "uploadHeaders",
    "uploadUrl",
  ]);
  assert.equal(intent.mediaAssetId, 9);
  assert.deepEqual(intent.uploadHeaders, {
    "Content-Type": "audio/mpeg",
    "Content-Length": String(50 * 1024 * 1024),
    "If-None-Match": "*",
  });
  assert.match(intent.uploadUrl, /^https:\/\/storage\.invalid\/audio\//);
  assert.ok(Date.parse(intent.expiresAt) > Date.now() + 14 * 60 * 1_000);
  assert.ok(Date.parse(intent.expiresAt) <= Date.now() + 15 * 60 * 1_000);
  assert.deepEqual(calls, ["persist:upload-request", "sign"]);
  assert.equal(storage.uploads.length, 1);

  const unauthorized = await app.request("/api/admin/media/upload-intents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await app.request("/api/admin/media/upload-intents", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lessonId: 7,
      languageCode: "th",
      originalFilename: "lesson.wav",
      contentType: "audio/mpeg",
      sizeBytes: 0,
      extra: true,
    }),
  });
  assert.equal(invalid.status, 422);
  assert.equal(
    problemDetailsSchema.parse(await invalid.json()).code,
    "validation_failed",
  );
});

test("BFF accepts a test-only Upload Intent object-key generator", async () => {
  const storage = new FakeStorage();
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    storageBucket: "citizenship-audio",
    objectKeyGenerator: () => "smoke/123e4567-e89b-12d3-a456-426614174000.mp3",
    dataServiceClient: createTestDataServiceClient({
      async createPendingMediaAsset(input) {
        assert.equal(
          input.objectKey,
          "smoke/123e4567-e89b-12d3-a456-426614174000.mp3",
        );
        const { languageCode: _languageCode, ...mediaAsset } = input;
        return mediaAssetResponseSchema.parse({
          id: 10,
          ...mediaAsset,
          status: "PENDING",
          durationMs: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          uploadedAt: null,
        });
      },
    }),
  });

  const response = await app.request("/api/admin/media/upload-intents", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lessonId: 7,
      languageCode: "th",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(storage.uploads, [
    {
      key: "smoke/123e4567-e89b-12d3-a456-426614174000.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    },
  ]);
});

test("BFF does not sign when pending Media Asset persistence fails", async () => {
  const storage = new FakeStorage();
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    storageBucket: "citizenship-audio",
    dataServiceClient: createTestDataServiceClient({
      async createPendingMediaAsset() {
        throw new DataServiceError(
          problemDetailsSchema.parse({
            type: "https://ez-dk-citizen.invalid/problems/unsupported_language",
            title: "Unprocessable Content",
            status: 422,
            detail: "Language is not supported.",
            instance: "/internal/media-assets",
            code: "unsupported_language",
            requestId: "downstream",
          }),
        );
      },
    }),
  });
  const response = await app.request("/api/admin/media/upload-intents", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lessonId: 7,
      languageCode: "zz",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    }),
  });

  assert.equal(response.status, 422);
  assert.equal((await response.json()).code, "unsupported_language");
  assert.equal(storage.uploads.length, 0);
});

test("BFF leaves a pending Media Asset and logs safely when storage signing fails", async (context) => {
  const log = context.mock.method(console, "log", () => undefined);
  const storage = new FakeStorage();
  storage.createUploadAuthorization = async () => {
    throw Object.assign(
      new Error("secret-token https://s3.invalid/?X-Amz-Signature=secret"),
      {
        name: "CredentialsProviderError",
        $metadata: { requestId: "aws-signing-request" },
      },
    );
  };
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    storageBucket: "citizenship-audio",
    dataServiceClient: createTestDataServiceClient({
      async createPendingMediaAsset() {
        return mediaAssetResponseSchema.parse({
          id: 10,
          storageProvider: "s3",
          storageContainer: "citizenship-audio",
          objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
          originalFilename: "lesson.mp3",
          contentType: "audio/mpeg",
          sizeBytes: 1,
          status: "PENDING",
          durationMs: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          uploadedAt: null,
        });
      },
    }),
  });
  const response = await app.request("/api/admin/media/upload-intents", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "signing-request",
    },
    body: JSON.stringify({
      lessonId: 7,
      languageCode: "th",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    }),
  });

  assert.equal(response.status, 502);
  const failure = problemDetailsSchema.parse(await response.json());
  assert.equal(failure.code, "storage_unavailable");
  assert.equal(failure.requestId, "signing-request");
  const events = log.mock.calls.map((call) =>
    JSON.parse(String(call.arguments[0])),
  );
  assert.deepEqual(
    events.find((event) => event.operation === "upload"),
    {
      requestId: "signing-request",
      operation: "upload",
      mediaAssetId: 10,
      storageErrorCode: "CredentialsProviderError",
      storageRequestId: "aws-signing-request",
    },
  );
  const output = JSON.stringify({ events, failure });
  for (const secret of [
    "secret-token",
    "X-Amz-Signature",
    "admin-token",
    "lesson.mp3",
  ]) {
    assert.equal(output.includes(secret), false);
  }
});
