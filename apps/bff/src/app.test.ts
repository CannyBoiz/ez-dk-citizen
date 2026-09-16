import {
  lessonDetailSchema,
  livenessResponseSchema,
  mediaAssetResponseSchema,
  problemDetailsSchema,
  readinessResponseSchema,
  sourceResponseSchema,
} from "@ez-dk-citizen/api-contracts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createBffApp } from "./app.js";
import {
  DataServiceError,
  type DataServiceClient,
} from "./data-service-client.js";
import { FakeStorage } from "./storage.js";

function createTestDataServiceClient(
  overrides: Partial<DataServiceClient>,
): DataServiceClient {
  const unused = async (): Promise<never> => {
    throw new Error("not used");
  };
  return {
    createPendingMediaAsset: unused,
    getMediaAsset: unused,
    failMediaAsset: unused,
    completeMediaAsset: unused,
    createLesson: unused,
    upsertLessonText: unused,
    listLessons: unused,
    getLesson: unused,
    patchLesson: unused,
    createSource: unused,
    listSources: unused,
    upsertLessonSource: unused,
    deleteLessonSource: unused,
    listPublishedLessons: unused,
    getPublishedLesson: unused,
    ...overrides,
  };
}

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

test("BFF completes matching stored media through the admin route", async () => {
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
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    dataServiceClient: createTestDataServiceClient({
      async getMediaAsset(id, requestId) {
        assert.equal(id, asset.id);
        assert.equal(requestId, "complete-request");
        return asset;
      },
      async completeMediaAsset(id, input, requestId) {
        assert.equal(id, asset.id);
        assert.deepEqual(input, { lessonId: 7, languageCode: "th" });
        assert.equal(requestId, "complete-request");
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

test("BFF keeps incomplete uploads pending and fails invalid uploads before exact cleanup", async (context) => {
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
  const request = (app: ReturnType<typeof createBffApp>) =>
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
    const app = createBffApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      dataServiceClient: createTestDataServiceClient({
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
        const app = createBffApp(async () => undefined, {
          adminApiToken: "admin-token",
          storage,
          dataServiceClient: createTestDataServiceClient({
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
    const app = createBffApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      dataServiceClient: createTestDataServiceClient({
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
    const app = createBffApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      dataServiceClient: createTestDataServiceClient({
        async getMediaAsset() {
          return asset;
        },
        async failMediaAsset() {
          calls.push("fail");
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
        const app = createBffApp(async () => undefined, {
          adminApiToken: "admin-token",
          storage,
          dataServiceClient: createTestDataServiceClient({
            async getMediaAsset() {
              return asset;
            },
            async failMediaAsset(id, requestId) {
              assert.equal(id, asset.id);
              assert.equal(requestId, "failure-request");
              calls.push("fail");
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
      const app = createBffApp(async () => undefined, {
        adminApiToken: "admin-token",
        storage,
        dataServiceClient: createTestDataServiceClient({
          async getMediaAsset() {
            return asset;
          },
          async failMediaAsset() {
            calls.push("fail");
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

test("BFF preserves completion conflicts from the Data Service", async () => {
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
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage: new FakeStorage(),
    dataServiceClient: createTestDataServiceClient({
      async getMediaAsset() {
        return asset;
      },
      async completeMediaAsset() {
        throw new DataServiceError(
          problemDetailsSchema.parse({
            type: "https://ez-dk-citizen.invalid/problems/lesson_text_not_found",
            title: "Conflict",
            status: 409,
            detail: "Lesson Text was not found.",
            instance: "/internal/media-assets/9/complete",
            code: "lesson_text_not_found",
            requestId: "downstream",
          }),
        );
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

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "lesson_text_not_found");
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

test("BFF leaves a pending Media Asset when storage signing fails", async () => {
  const storage = new FakeStorage();
  storage.createUploadAuthorization = async () => {
    throw new Error("S3 is unavailable");
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
});

test("BFF health is independent of the Data Service", async () => {
  let checks = 0;
  const app = createBffApp(async () => {
    checks += 1;
  });

  const response = await app.request("/health");

  assert.equal(response.status, 200);
  livenessResponseSchema.parse(await response.json());
  assert.equal(checks, 0);
});

test("BFF readiness reflects the Data Service", async (context) => {
  await context.test("ready", async () => {
    const app = createBffApp(async () => undefined);
    const response = await app.request("/ready");

    assert.equal(response.status, 200);
    assert.deepEqual(readinessResponseSchema.parse(await response.json()), {
      status: "ok",
    });
  });

  await context.test("unavailable", async () => {
    const app = createBffApp(async () => {
      throw new Error("Data Service is unavailable");
    });
    const response = await app.request("/ready");

    assert.equal(response.status, 503);
    assert.deepEqual(readinessResponseSchema.parse(await response.json()), {
      status: "unavailable",
    });
  });
});

test("BFF rejects write bodies above 1 MiB with Problem Details", async () => {
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
  });
  const response = await app.request("/api/admin/lessons", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chapter: 1,
      version: 1,
      padding: "x".repeat(1024 * 1024),
    }),
  });

  assert.equal(response.status, 422);
  assert.equal(
    problemDetailsSchema.parse(await response.json()).code,
    "body_too_large",
  );
});

test("admin Lesson routes authenticate and use the Data Service client seam", async () => {
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 2,
    version: 1,
    status: "DRAFT",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    availableLanguageCodes: [],
    lessonTexts: [],
    lessonSources: [],
  });
  const calls: string[] = [];
  const summary = {
    id: detail.id,
    chapter: detail.chapter,
    version: detail.version,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    availableLanguageCodes: detail.availableLanguageCodes,
  };
  const client = createTestDataServiceClient({
    async createLesson(input, requestId) {
      calls.push(`create:${input.chapter}:${input.version}:${requestId}`);
      return detail;
    },
    async listLessons(requestId) {
      calls.push(`list:${requestId}`);
      return { items: [summary] };
    },
    async getLesson(id, requestId) {
      calls.push(`get:${id}:${requestId}`);
      return detail;
    },
  });
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    adminOrigins: ["https://admin.example"],
    dataServiceClient: client,
  });

  const unauthorized = await app.request("/api/admin/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter: 2, version: 1 }),
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get("www-authenticate"), "Bearer");
  problemDetailsSchema.parse(await unauthorized.json());

  const unauthorizedRead = await app.request("/api/admin/lessons/7");
  assert.equal(unauthorizedRead.status, 401);

  const invalidCredential = await app.request("/api/admin/lessons/7", {
    headers: { Authorization: "Bearer wrong-token" },
  });
  assert.equal(invalidCredential.status, 401);

  const created = await app.request("/api/admin/lessons", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "request-1",
    },
    body: JSON.stringify({ chapter: 2, version: 1 }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("location"), "/api/admin/lessons/7");
  assert.deepEqual(await created.json(), detail);

  const list = await app.request("/api/admin/lessons", {
    headers: { Authorization: "Bearer admin-token" },
  });
  assert.equal(list.status, 200);
  assert.deepEqual((await list.json()).items, [summary]);

  const inspected = await app.request("/api/admin/lessons/7", {
    headers: { Authorization: "Bearer admin-token" },
  });
  assert.equal(inspected.status, 200);
  assert.deepEqual(await inspected.json(), detail);
  assert.equal(calls.length, 3);
  assert.match(calls[0], /^create:2:1:request-1$/);

  const corsResponse = await app.request("/api/admin/lessons", {
    method: "OPTIONS",
    headers: {
      Origin: "https://admin.example",
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "Authorization",
    },
  });
  assert.equal(
    corsResponse.headers.get("access-control-allow-origin"),
    "https://admin.example",
  );
  assert.equal(
    corsResponse.headers.get("access-control-allow-credentials"),
    null,
  );
});

test("BFF preserves safe Data Service resource failures", async () => {
  const details = problemDetailsSchema.parse({
    type: "https://ez-dk-citizen.invalid/problems/lesson_not_found",
    title: "Not Found",
    status: 404,
    detail: "Lesson was not found.",
    instance: "/internal/lessons/99",
    code: "lesson_not_found",
    requestId: "downstream",
  });
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    dataServiceClient: createTestDataServiceClient({
      async getLesson() {
        throw new DataServiceError(details);
      },
    }),
  });

  const response = await app.request("/api/admin/lessons/99", {
    headers: { Authorization: "Bearer admin-token" },
  });
  assert.equal(response.status, 404);
  assert.equal(
    response.headers.get("content-type"),
    "application/problem+json",
  );
  assert.equal((await response.json()).code, "lesson_not_found");
});

test("BFF upserts a localized Lesson Text through its client seam", async () => {
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 2,
    version: 1,
    status: "DRAFT",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    availableLanguageCodes: ["th"],
    lessonTexts: [{ languageCode: "th", title: "บท", content: "เนื้อหา" }],
    lessonSources: [],
  });
  const calls: string[] = [];
  const client = createTestDataServiceClient({
    async upsertLessonText(
      lessonId: number,
      languageCode: string,
      input: { title: string; content: string },
      requestId: string,
    ) {
      calls.push(
        `${lessonId}:${languageCode}:${input.title}:${input.content}:${requestId}`,
      );
      return detail;
    },
  });
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    dataServiceClient: client,
  });

  const response = await app.request("/api/admin/lessons/7/texts/th", {
    method: "PUT",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "request-2",
    },
    body: JSON.stringify({ title: "บท", content: "เนื้อหา" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), detail);
  assert.deepEqual(calls, ["7:th:บท:เนื้อหา:request-2"]);

  const invalidId = await app.request("/api/admin/lessons/0/texts/th", {
    method: "PUT",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "บท", content: "เนื้อหา" }),
  });
  assert.equal(invalidId.status, 422);
  assert.ok(problemDetailsSchema.parse(await invalidId.json()).errors?.length);
});

test("BFF hides unrecognized downstream failures", async () => {
  const details = problemDetailsSchema.parse({
    type: "https://ez-dk-citizen.invalid/problems/database_failure",
    title: "Not Found",
    status: 404,
    detail: "select * from secret_table failed",
    instance: "/internal/lessons/99",
    code: "database_failure",
    requestId: "downstream",
  });
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    dataServiceClient: createTestDataServiceClient({
      async getLesson() {
        throw new DataServiceError(details);
      },
    }),
  });

  const response = await app.request("/api/admin/lessons/99", {
    headers: { Authorization: "Bearer admin-token" },
  });
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "data_service_unavailable");
});

test("BFF creates and lists canonical Sources through its client seam", async () => {
  const source = sourceResponseSchema.parse({
    id: 3,
    url: "https://example.com/source",
    publishedAt: "2026-01-01T00:00:00.000Z",
  });
  const calls: string[] = [];
  const conflict = new DataServiceError(
    problemDetailsSchema.parse({
      type: "https://ez-dk-citizen.invalid/problems/source_url_conflict",
      title: "Conflict",
      status: 409,
      detail: "A Source with this URL already exists.",
      instance: "/internal/sources",
      code: "source_url_conflict",
      requestId: "downstream",
    }),
  );
  const client = createTestDataServiceClient({
    async createSource(input, requestId) {
      if (input.url.endsWith("conflict")) throw conflict;
      calls.push(`${input.url}:${input.publishedAt}:${requestId}`);
      return source;
    },
    async listSources(requestId) {
      calls.push(`list:${requestId}`);
      return { items: [source] };
    },
  });
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    dataServiceClient: client,
  });

  const unauthorized = await app.request("/api/admin/sources", {
    method: "POST",
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: "ftp://example.com", publishedAt: null }),
  });
  assert.equal(invalid.status, 422);

  const unknownProperty = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://example.com/source",
      publishedAt: null,
      extra: true,
    }),
  });
  assert.equal(unknownProperty.status, 422);

  const malformed = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);

  const nonJson = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "text/plain",
    },
    body: "https://example.com/source",
  });
  assert.equal(nonJson.status, 422);

  const created = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "request-3",
    },
    body: JSON.stringify({
      url: " https://example.com/source ",
      publishedAt: "2026-01-01T00:00:00Z",
    }),
  });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("location"), "/api/admin/sources/3");
  assert.deepEqual(await created.json(), source);

  const duplicate = await app.request("/api/admin/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://example.com/conflict",
      publishedAt: null,
    }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "source_url_conflict");

  const listed = await app.request("/api/admin/sources", {
    headers: { Authorization: "Bearer admin-token" },
  });
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), { items: [source] });
  assert.equal(
    calls[0],
    "https://example.com/source:2026-01-01T00:00:00Z:request-3",
  );
  assert.match(calls[1]!, /^list:[\da-f-]{36}$/);
});

test("BFF replaces and detaches Draft Lesson Sources through its client seam", async () => {
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 2,
    version: 1,
    status: "DRAFT",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    availableLanguageCodes: [],
    lessonTexts: [],
    lessonSources: [
      {
        id: 3,
        url: "https://example.com/source",
        publishedAt: null,
        pageFrom: 2,
        pageTo: 3,
        sectionReference: "section 1",
      },
    ],
  });
  const sourceNotFound = new DataServiceError(
    problemDetailsSchema.parse({
      type: "https://ez-dk-citizen.invalid/problems/source_not_found",
      title: "Not Found",
      status: 404,
      detail: "Source was not found.",
      instance: "/internal/lessons/7/sources/99",
      code: "source_not_found",
      requestId: "downstream",
    }),
  );
  const calls: string[] = [];
  const client = createTestDataServiceClient({
    async upsertLessonSource(lessonId, sourceId, input, requestId) {
      if (sourceId === 99) throw sourceNotFound;
      calls.push(`${lessonId}:${sourceId}:${input.pageFrom}:${requestId}`);
      return detail;
    },
    async deleteLessonSource(lessonId, sourceId, requestId) {
      calls.push(`delete:${lessonId}:${sourceId}:${requestId}`);
    },
  });
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    dataServiceClient: client,
  });

  const unauthorized = await app.request("/api/admin/lessons/7/sources/3", {
    method: "PUT",
  });
  assert.equal(unauthorized.status, 401);

  const invalidSource = await app.request("/api/admin/lessons/7/sources/0", {
    method: "PUT",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(invalidSource.status, 422);

  const invalidLocator = await app.request("/api/admin/lessons/7/sources/3", {
    method: "PUT",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pageFrom: 4, pageTo: 3 }),
  });
  assert.equal(invalidLocator.status, 422);

  const attached = await app.request("/api/admin/lessons/7/sources/3", {
    method: "PUT",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "request-4",
    },
    body: JSON.stringify({
      pageFrom: 2,
      pageTo: 3,
      sectionReference: "section 1",
    }),
  });
  assert.equal(attached.status, 200);
  assert.deepEqual(await attached.json(), detail);

  const missingSource = await app.request("/api/admin/lessons/7/sources/99", {
    method: "PUT",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(missingSource.status, 404);
  assert.equal((await missingSource.json()).code, "source_not_found");

  const detached = await app.request("/api/admin/lessons/7/sources/3", {
    method: "DELETE",
    headers: {
      Authorization: "Bearer admin-token",
      "X-Request-ID": "request-5",
    },
  });
  assert.equal(detached.status, 204);
  assert.deepEqual(calls, ["7:3:2:request-4", "delete:7:3:request-5"]);
});

test("BFF patches Lessons through its client seam", async () => {
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 3,
    version: 2,
    status: "PUBLISHED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    availableLanguageCodes: [],
    lessonTexts: [],
    lessonSources: [],
  });
  const conflict = new DataServiceError(
    problemDetailsSchema.parse({
      type: "https://ez-dk-citizen.invalid/problems/published_lesson_conflict",
      title: "Conflict",
      status: 409,
      detail: "This chapter already has a Published Lesson.",
      instance: "/internal/lessons/7",
      code: "published_lesson_conflict",
      requestId: "downstream",
    }),
  );
  const calls: string[] = [];
  const client = createTestDataServiceClient({
    async patchLesson(id, input, requestId) {
      if (input.chapter === 99) throw conflict;
      calls.push(`${id}:${input.chapter}:${input.status}:${requestId}`);
      return detail;
    },
  });
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    dataServiceClient: client,
  });

  const invalid = await app.request("/api/admin/lessons/7", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(invalid.status, 422);

  const patched = await app.request("/api/admin/lessons/7", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
      "X-Request-ID": "request-6",
    },
    body: JSON.stringify({ chapter: 3, version: 2, status: "PUBLISHED" }),
  });
  assert.equal(patched.status, 200);
  assert.deepEqual(await patched.json(), detail);
  assert.deepEqual(calls, ["7:3:PUBLISHED:request-6"]);

  const publishedConflict = await app.request("/api/admin/lessons/7", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chapter: 99 }),
  });
  assert.equal(publishedConflict.status, 409);
  assert.equal(
    (await publishedConflict.json()).code,
    "published_lesson_conflict",
  );
});

test("BFF composes localized mobile responses from Lesson aggregates", async () => {
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 2,
    version: 1,
    status: "PUBLISHED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    availableLanguageCodes: ["da", "th"],
    lessonTexts: [
      { languageCode: "da", title: "Dansk", content: "Indhold" },
      { languageCode: "th", title: "ไทย", content: "เนื้อหา" },
    ],
    lessonSources: [
      {
        id: 3,
        url: "https://example.com/source",
        publishedAt: null,
        pageFrom: 2,
        pageTo: 3,
        sectionReference: null,
      },
    ],
  });
  const nextLesson = lessonDetailSchema.parse({
    ...detail,
    id: 8,
    chapter: 3,
    lessonTexts: [{ languageCode: "th", title: "ถัดไป", content: "ต่อไป" }],
  });
  const untranslatedLesson = lessonDetailSchema.parse({
    ...detail,
    id: 9,
    chapter: 4,
    lessonTexts: [
      { languageCode: "da", title: "Kun dansk", content: "Indhold" },
    ],
  });
  const unsupportedLanguage = new DataServiceError(
    problemDetailsSchema.parse({
      type: "https://ez-dk-citizen.invalid/problems/unsupported_language",
      title: "Unprocessable Content",
      status: 422,
      detail: "Language is not supported.",
      instance: "/internal/lessons",
      code: "unsupported_language",
      requestId: "downstream",
    }),
  );
  const calls: string[] = [];
  const client = createTestDataServiceClient({
    async listPublishedLessons(languageCode: string, requestId: string) {
      calls.push(`list:${languageCode}:${requestId}`);
      if (languageCode === "xx") throw unsupportedLanguage;
      return { items: [detail, nextLesson, untranslatedLesson] };
    },
    async getPublishedLesson(
      id: number,
      languageCode: string,
      requestId: string,
    ) {
      calls.push(`detail:${id}:${languageCode}:${requestId}`);
      return detail;
    },
  });
  const app = createBffApp(async () => undefined, {
    dataServiceClient: client,
  });

  const list = await app.request("/api/mobile/lessons", {
    headers: { "X-Request-ID": "mobile-list" },
  });
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), {
    items: [
      {
        id: 7,
        chapter: 2,
        version: 1,
        languageCode: "th",
        title: "ไทย",
      },
      {
        id: 8,
        chapter: 3,
        version: 1,
        languageCode: "th",
        title: "ถัดไป",
      },
    ],
  });

  const explicitList = await app.request("/api/mobile/lessons?language=da", {
    headers: { "X-Request-ID": "mobile-da" },
  });
  assert.equal(explicitList.status, 200);
  assert.deepEqual(await explicitList.json(), {
    items: [
      {
        id: 7,
        chapter: 2,
        version: 1,
        languageCode: "da",
        title: "Dansk",
      },
      {
        id: 9,
        chapter: 4,
        version: 1,
        languageCode: "da",
        title: "Kun dansk",
      },
    ],
  });

  const inspected = await app.request("/api/mobile/lessons/7?language=da", {
    headers: { "X-Request-ID": "mobile-detail" },
  });
  assert.equal(inspected.status, 200);
  assert.deepEqual(await inspected.json(), {
    id: 7,
    chapter: 2,
    version: 1,
    languageCode: "da",
    title: "Dansk",
    content: "Indhold",
    availableLanguageCodes: ["da", "th"],
    lessonSources: detail.lessonSources,
  });

  const emptyLanguage = await app.request("/api/mobile/lessons?language=");
  assert.equal(emptyLanguage.status, 422);
  assert.ok(
    problemDetailsSchema.parse(await emptyLanguage.json()).errors?.length,
  );
  const unsupported = await app.request("/api/mobile/lessons?language=xx");
  assert.equal(unsupported.status, 422);
  assert.equal((await unsupported.json()).code, "unsupported_language");
  assert.deepEqual(calls.slice(0, 3), [
    "list:th:mobile-list",
    "list:da:mobile-da",
    "detail:7:da:mobile-detail",
  ]);
  assert.match(calls[3]!, /^list:xx:[\da-f-]{36}$/);
});

test("BFF unmatched routes return Problem Details", async () => {
  const app = createBffApp(async () => undefined);

  const response = await app.request("/missing");

  assert.equal(response.status, 404);
  assert.equal(
    response.headers.get("content-type"),
    "application/problem+json",
  );
  assert.equal((await response.json()).code, "not_found");
});
