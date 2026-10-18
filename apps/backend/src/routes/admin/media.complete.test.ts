import assert from "node:assert/strict";
import { test } from "node:test";
import { mediaAssetResponseSchema } from "@ez-dk-citizen/api-contracts";

import { createBackendApp } from "../../app.js";
import { FakeStorage } from "../../storage.js";
import { createTestDataModule } from "../../testing/data-module.js";

test("Backend completes matching stored media through the admin route", async () => {
  const storage = new FakeStorage();
  const asset = mediaAssetResponseSchema.parse({
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
  storage.putObject(asset.objectKey, {
    contentType: asset.contentType,
    sizeBytes: asset.sizeBytes,
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    data: createTestDataModule({
      async getMediaAsset(id) {
        assert.equal(id, asset.id);
        return asset;
      },
      async completeMediaAsset(id, input) {
        assert.equal(id, asset.id);
        assert.deepEqual(input, { lessonId: 7, languageCode: "th" });
        return {
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
        };
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
  const storage = new FakeStorage();
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
        return mediaAssetResponseSchema.parse({
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
      },
      async completeMediaAsset() {
        return completion;
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

test("Backend keeps incomplete uploads pending and fails invalid uploads before exact cleanup", async (context) => {
  const asset = mediaAssetResponseSchema.parse({
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
    const storage = new FakeStorage();
    const app = createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      data: createTestDataModule({
        async getMediaAsset() {
          return asset;
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
        const storage = new FakeStorage();
        storage.inspectObject = async () => {
          throw Object.assign(new Error(name), { name });
        };
        const app = createBackendApp(async () => undefined, {
          adminApiToken: "admin-token",
          storage,
          data: createTestDataModule({
            async getMediaAsset() {
              return asset;
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
    const storage = new FakeStorage();
    const logs: unknown[] = [];
    storage.inspectObject = async () => {
      throw Object.assign(
        new Error(
          "Bearer admin-token https://storage.invalid/audio/private.mp3?signature=secret request body",
        ),
        { name: "SlowDown", $metadata: { requestId: "aws-request" } },
      );
    };
    const app = createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      data: createTestDataModule({
        async getMediaAsset() {
          return asset;
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

  await context.test("fails incomplete metadata before cleanup", async () => {
    const storage = new FakeStorage();
    const calls: string[] = [];
    storage.inspectObject = async () => ({});
    storage.deleteObject = async (key) => {
      assert.equal(key, asset.objectKey);
      calls.push("delete");
    };
    const app = createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      data: createTestDataModule({
        async getMediaAsset() {
          return asset;
        },
        async failMediaAsset() {
          calls.push("fail");
          return undefined;
        },
      }),
    });

    assert.equal((await request(app)).status, 422);
    assert.deepEqual(calls, ["fail", "delete"]);
  });

  await context.test(
    "fails metadata mismatches before deleting the exact object",
    async () => {
      for (const object of [
        { contentType: "audio/mpeg", sizeBytes: 2 },
        { contentType: "audio/ogg", sizeBytes: 1 },
      ]) {
        const storage = new FakeStorage();
        const calls: string[] = [];
        storage.putObject(asset.objectKey, object);
        storage.deleteObject = async (key) => {
          assert.equal(key, asset.objectKey);
          calls.push("delete");
        };
        const app = createBackendApp(async () => undefined, {
          adminApiToken: "admin-token",
          storage,
          data: createTestDataModule({
            async getMediaAsset() {
              return asset;
            },
            async failMediaAsset(id) {
              assert.equal(id, asset.id);
              calls.push("fail");
              return undefined;
            },
            async completeMediaAsset() {
              throw new Error("invalid media must not complete");
            },
          }),
        });

        const response = await request(app);
        assert.equal(response.status, 422);
        assert.equal((await response.json()).code, "invalid_uploaded_media");
        assert.deepEqual(calls, ["fail", "delete"]);
      }
    },
  );

  await context.test(
    "keeps failed media terminal when cleanup and storage diagnostics fail",
    async () => {
      const storage = new FakeStorage();
      const calls: string[] = [];
      const logs: unknown[] = [];
      storage.putObject(asset.objectKey, {
        contentType: "audio/ogg",
        sizeBytes: asset.sizeBytes,
      });
      storage.deleteObject = async (key) => {
        assert.equal(key, asset.objectKey);
        calls.push("delete");
        throw Object.assign(
          new Error(
            "Bearer admin-token https://storage.invalid/audio/private.mp3?signature=secret request body",
          ),
          { name: "AccessDenied", $metadata: { requestId: "aws-request" } },
        );
      };
      const app = createBackendApp(async () => undefined, {
        adminApiToken: "admin-token",
        storage,
        data: createTestDataModule({
          async getMediaAsset() {
            return asset;
          },
          async failMediaAsset() {
            calls.push("fail");
            return undefined;
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

      assert.deepEqual(calls, ["fail", "delete"]);
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
  const asset = mediaAssetResponseSchema.parse({
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
        storage: new FakeStorage(),
        data: createTestDataModule({
          async getMediaAsset() {
            return asset;
          },
          async completeMediaAsset() {
            return outcome;
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
      storage: new FakeStorage(),
      data: createTestDataModule({
        async getMediaAsset() {
          return "media_asset_not_found";
        },
      }),
    }),
  );
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "media_asset_not_found");

  // A mismatched upload that another request settles first keeps its object.
  const storage = new FakeStorage();
  const mismatched = { contentType: "audio/mpeg", sizeBytes: 2 };
  storage.putObject(asset.objectKey, mismatched);
  const settled = await complete(
    createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      data: createTestDataModule({
        async getMediaAsset() {
          return { ...asset, status: "PENDING" };
        },
        async failMediaAsset() {
          return "media_asset_not_pending";
        },
      }),
    }),
  );
  assert.equal(settled.status, 409);
  assert.equal((await settled.json()).code, "media_asset_not_pending");
  assert.deepEqual(await storage.inspectObject(asset.objectKey), mismatched);
});

test("Backend retries ready media without inspecting storage", async () => {
  const asset = mediaAssetResponseSchema.parse({
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
  const storage = new FakeStorage();
  storage.inspectObject = async () => {
    throw new Error("matching retry must not inspect storage");
  };
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    data: createTestDataModule({
      async getMediaAsset() {
        return asset;
      },
      async completeMediaAsset() {
        return {
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
        };
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
