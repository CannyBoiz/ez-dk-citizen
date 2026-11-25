import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { fail, mediaAssetSchema, ok } from "@ez-dk-citizen/data";

import { createBackendApp } from "../../app.ts";
import type { Storage } from "../../storage.ts";
import { createTestDataModule } from "../../testing/data-module.ts";
import { createFakeStorage } from "../../testing/storage.ts";

test("Backend completes matching stored media through the admin route", async () => {
  const asset = mediaAssetSchema.parse({
    id: 9,
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
  const storage = createFakeStorage({
    async inspectObject(key) {
      assert.equal(key, asset.objectKey);
      return { contentType: asset.contentType, sizeBytes: asset.sizeBytes };
    },
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    data: createTestDataModule({
      async getMediaAsset(id) {
        assert.equal(id, asset.id);
        return ok(asset);
      },
      async completeMediaAsset(id, input) {
        assert.equal(id, asset.id);
        assert.deepEqual(input, { lessonId: 7, languageCode: "th" });
        return ok({
          mediaAsset: {
            id,
            status: "READY",
            contentType: "audio/mpeg",
            sizeBytes: 1,
            durationMs: null,
            uploadedAt: "2026-01-01T00:01:00.000Z",
          },
          lessonAudio: {
            id: 3,
            lessonId: 7,
            languageCode: "th",
            audioVersion: 1,
            isCurrent: true,
            createdAt: "2026-01-01T00:01:00.000Z",
          },
        });
      },
    }),
  });

  const response = await app.request("/api/admin/media/9/complete", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "complete-request",
    },
    body: JSON.stringify({ lessonId: 7, languageCode: "th" }),
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "complete-request");
  const body = await response.json();
  assert.deepEqual(Object.keys(body.mediaAsset).sort(), [
    "contentType",
    "durationMs",
    "id",
    "sizeBytes",
    "status",
    "uploadedAt",
  ]);
  assert.equal(body.lessonAudio.audioVersion, 1);
  assert.equal("objectKey" in body.mediaAsset, false);

  const unauthorized = await app.request("/api/admin/media/9/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lessonId: 7, languageCode: "th" }),
  });
  assert.equal(unauthorized.status, 401);
});

test("Backend returns a completion retry for superseded audio as not current", async () => {
  const storage = createFakeStorage();
  const completion = {
    mediaAsset: {
      id: 9,
      status: "READY" as const,
      contentType: "audio/mpeg" as const,
      sizeBytes: 1,
      durationMs: null,
      uploadedAt: "2026-01-01T00:01:00.000Z",
    },
    lessonAudio: {
      id: 3,
      lessonId: 7,
      languageCode: "th",
      audioVersion: 1,
      isCurrent: false,
      createdAt: "2026-01-01T00:01:00.000Z",
    },
  };
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    data: createTestDataModule({
      async getMediaAsset() {
        return ok(
          mediaAssetSchema.parse({
            id: 9,
            storageProvider: "s3",
            storageContainer: "citizenship-audio",
            objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
            originalFilename: "lesson.mp3",
            contentType: "audio/mpeg",
            sizeBytes: 1,
            status: "READY",
            durationMs: null,
            createdAt: "2026-01-01T00:00:00.000Z",
            uploadedAt: "2026-01-01T00:01:00.000Z",
          }),
        );
      },
      async completeMediaAsset() {
        return ok(completion);
      },
    }),
  });

  const response = await app.request("/api/admin/media/9/complete", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lessonId: 7, languageCode: "th" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), completion);
});

test("Backend keeps incomplete uploads pending and deletes the exact object of invalid uploaded media", async (context) => {
  const asset = mediaAssetSchema.parse({
    id: 9,
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
  const request = (app: ReturnType<typeof createBackendApp>) =>
    app.request("/api/admin/media/9/complete", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
        "X-Request-ID": "failure-request",
      },
      body: JSON.stringify({ lessonId: 7, languageCode: "th" }),
    });

  await context.test("reports a missing object as retryable", async () => {
    const storage = createFakeStorage({
      async inspectObject() {
        throw Object.assign(new Error("S3 object was not found."), {
          name: "NotFound",
        });
      },
    });
    const app = createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      data: createTestDataModule({
        async getMediaAsset() {
          return ok(asset);
        },
      }),
    });

    const response = await request(app);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "upload_incomplete");
  });

  await context.test(
    "reports transient and timed-out storage failures as retryable",
    async () => {
      for (const [name, status, code] of [
        ["SlowDown", 503, "storage_unavailable"],
        ["TimeoutError", 504, "storage_timeout"],
      ] as const) {
        const storage = createFakeStorage({
          async inspectObject() {
            throw Object.assign(new Error(name), { name });
          },
        });
        const app = createBackendApp(async () => undefined, {
          adminApiToken: "admin-token",
          storage,
          data: createTestDataModule({
            async getMediaAsset() {
              return ok(asset);
            },
          }),
        });

        const response = await request(app);
        assert.equal(response.status, status);
        assert.equal((await response.json()).code, code);
      }
    },
  );

  await context.test("logs inspect failures without secrets", async () => {
    const logs: unknown[] = [];
    const storage = createFakeStorage({
      async inspectObject() {
        throw Object.assign(
          new Error(
            "Bearer admin-token https://storage.invalid/audio/private.mp3?signature=secret request body",
          ),
          { name: "SlowDown", $metadata: { requestId: "aws-request" } },
        );
      },
    });
    const app = createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      data: createTestDataModule({
        async getMediaAsset() {
          return ok(asset);
        },
      }),
    });
    const originalLog = console.log;
    console.log = (entry: unknown) => logs.push(entry);
    try {
      assert.equal((await request(app)).status, 503);
    } finally {
      console.log = originalLog;
    }

    const inspectLog = logs
      .map((entry) => JSON.parse(String(entry)))
      .find((entry) => entry.operation === "inspect");
    assert.deepEqual(inspectLog, {
      requestId: "failure-request",
      operation: "inspect",
      mediaAssetId: asset.id,
      storageErrorCode: "SlowDown",
      storageRequestId: "aws-request",
    });
    assert.doesNotMatch(
      logs.join("\n"),
      /admin-token|storage\.invalid|signature|request body/,
    );
  });

  await context.test(
    "deletes the exact object and refuses invalid uploaded media",
    async () => {
      const stored = { contentType: "audio/ogg", sizeBytes: 1 };
      const deleteObject = mock.fn<Storage["deleteObject"]>(
        async () => undefined,
      );
      const app = createBackendApp(async () => undefined, {
        adminApiToken: "admin-token",
        storage: createFakeStorage({
          async inspectObject(key) {
            assert.equal(key, asset.objectKey);
            return stored;
          },
          deleteObject,
        }),
        data: createTestDataModule({
          async getMediaAsset() {
            return ok(asset);
          },
          async completeMediaAsset(id, input, storedObject) {
            assert.equal(id, asset.id);
            assert.deepEqual(input, { lessonId: 7, languageCode: "th" });
            assert.deepEqual(storedObject, stored);
            return fail("invalid_uploaded_media");
          },
        }),
      });

      const response = await request(app);
      assert.equal(response.status, 422);
      const body = await response.json();
      assert.equal(body.code, "invalid_uploaded_media");
      assert.equal(
        body.detail,
        "Uploaded object does not match its declared media metadata.",
      );
      assert.deepEqual(
        deleteObject.mock.calls.map((call) => call.arguments),
        [[asset.objectKey]],
      );
    },
  );

  await context.test(
    "logs a failed delete without secrets and still refuses invalid uploaded media",
    async () => {
      const calls: string[] = [];
      const logs: unknown[] = [];
      const storage = createFakeStorage({
        async inspectObject(key) {
          assert.equal(key, asset.objectKey);
          return { contentType: "audio/ogg", sizeBytes: asset.sizeBytes };
        },
        async deleteObject(key) {
          assert.equal(key, asset.objectKey);
          calls.push("delete");
          throw Object.assign(
            new Error(
              "Bearer admin-token https://storage.invalid/audio/private.mp3?signature=secret request body",
            ),
            { name: "AccessDenied", $metadata: { requestId: "aws-request" } },
          );
        },
      });
      const app = createBackendApp(async () => undefined, {
        adminApiToken: "admin-token",
        storage,
        data: createTestDataModule({
          async getMediaAsset() {
            return ok(asset);
          },
          async completeMediaAsset() {
            calls.push("complete");
            return fail("invalid_uploaded_media");
          },
        }),
      });
      const originalLog = console.log;
      console.log = (entry: unknown) => logs.push(entry);
      try {
        const response = await request(app);
        assert.equal(response.status, 422);
        assert.equal((await response.json()).code, "invalid_uploaded_media");
      } finally {
        console.log = originalLog;
      }

      assert.deepEqual(calls, ["complete", "delete"]);
      const cleanupLog = logs
        .map((entry) => JSON.parse(String(entry)))
        .find((entry) => entry.operation === "delete");
      assert.deepEqual(cleanupLog, {
        requestId: "failure-request",
        operation: "delete",
        mediaAssetId: asset.id,
        storageErrorCode: "AccessDenied",
        storageRequestId: "aws-request",
      });
      assert.doesNotMatch(
        logs.join("\n"),
        /admin-token|storage\.invalid|signature|request body/,
      );
    },
  );
});

test("Backend maps completion refusals to Problem Details", async () => {
  const asset = mediaAssetSchema.parse({
    id: 9,
    storageProvider: "s3",
    storageContainer: "citizenship-audio",
    objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
    originalFilename: "lesson.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 1,
    status: "READY",
    durationMs: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    uploadedAt: "2026-01-01T00:01:00.000Z",
  });
  const complete = (app: ReturnType<typeof createBackendApp>) =>
    app.request("/api/admin/media/9/complete", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ lessonId: 7, languageCode: "th" }),
    });

  for (const [outcome, status, detail] of [
    ["media_asset_not_found", 404, "Media Asset was not found."],
    ["lesson_not_found", 404, "Lesson was not found."],
    ["unsupported_language", 422, "Language is not supported."],
    ["lesson_text_not_found", 409, "Lesson Text was not found."],
    ["lesson_archived", 409, "Archived Lessons cannot receive audio."],
    ["media_asset_not_pending", 409, "Media Asset is not pending."],
    [
      "media_asset_failed",
      409,
      "Media Asset failed validation; create a new Upload Intent.",
    ],
    [
      "media_asset_rebind_conflict",
      409,
      "Media Asset is already bound to a different Lesson or Language.",
    ],
  ] as const) {
    const response = await complete(
      createBackendApp(async () => undefined, {
        adminApiToken: "admin-token",
        storage: createFakeStorage(),
        data: createTestDataModule({
          async getMediaAsset() {
            return ok(asset);
          },
          async completeMediaAsset() {
            return fail(outcome);
          },
        }),
      }),
    );
    assert.equal(response.status, status, outcome);
    const body = await response.json();
    assert.equal(body.code, outcome);
    assert.equal(body.detail, detail);
  }

  const missing = await complete(
    createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage: createFakeStorage(),
      data: createTestDataModule({
        async getMediaAsset() {
          return fail("media_asset_not_found");
        },
      }),
    }),
  );
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "media_asset_not_found");
});

test("Backend retries ready media without inspecting storage", async () => {
  const asset = mediaAssetSchema.parse({
    id: 9,
    storageProvider: "s3",
    storageContainer: "citizenship-audio",
    objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
    originalFilename: "lesson.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 1,
    status: "READY",
    durationMs: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    uploadedAt: "2026-01-01T00:01:00.000Z",
  });
  // The strict fake rejects inspectObject, so inspecting storage would fail the retry.
  const storage = createFakeStorage();
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    data: createTestDataModule({
      async getMediaAsset() {
        return ok(asset);
      },
      async completeMediaAsset() {
        return ok({
          mediaAsset: {
            id: asset.id,
            status: "READY",
            contentType: asset.contentType,
            sizeBytes: asset.sizeBytes,
            durationMs: null,
            uploadedAt: "2026-01-01T00:01:00.000Z",
          },
          lessonAudio: {
            id: 3,
            lessonId: 7,
            languageCode: "th",
            audioVersion: 1,
            isCurrent: true,
            createdAt: "2026-01-01T00:01:00.000Z",
          },
        });
      },
    }),
  });

  const response = await app.request("/api/admin/media/9/complete", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ lessonId: 7, languageCode: "th" }),
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).lessonAudio.audioVersion, 1);
});
