import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lessonDetailSchema,
  problemDetailsSchema,
} from "@ez-dk-citizen/api-contracts";

import { createBackendApp } from "../../app.js";
import { DataServiceError } from "../../data-service/client.js";
import { FakeStorage } from "../../storage.js";
import { createTestDataServiceClient } from "../../testing/data-service-client.js";

test("admin Lesson routes authenticate and use the Data Service client seam", async () => {
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 2,
    version: null,
    versionPatch: null,
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
    versionPatch: detail.versionPatch,
    status: detail.status,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    availableLanguageCodes: detail.availableLanguageCodes,
  };
  const client = createTestDataServiceClient({
    async createLesson(input, requestId) {
      calls.push(`create:${JSON.stringify(input)}:${requestId}`);
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
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    adminOrigins: ["https://admin.example"],
    dataServiceClient: client,
  });

  const unauthorized = await app.request("/api/admin/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter: 2 }),
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
    body: JSON.stringify({ chapter: 2 }),
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
  assert.equal(calls[0], 'create:{"chapter":2}:request-1');

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

test("Backend preserves safe Data Service resource failures", async () => {
  const details = problemDetailsSchema.parse({
    type: "https://ez-dk-citizen.invalid/problems/lesson_not_found",
    title: "Not Found",
    status: 404,
    detail: "Lesson was not found.",
    instance: "/internal/lessons/99",
    code: "lesson_not_found",
    requestId: "downstream",
  });
  const app = createBackendApp(async () => undefined, {
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

test("Backend upserts a localized Lesson Text through its client seam", async () => {
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 2,
    version: null,
    versionPatch: null,
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
  const app = createBackendApp(async () => undefined, {
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

test("Backend hides unrecognized downstream failures", async () => {
  const details = problemDetailsSchema.parse({
    type: "https://ez-dk-citizen.invalid/problems/database_failure",
    title: "Not Found",
    status: 404,
    detail: "select * from secret_table failed",
    instance: "/internal/lessons/99",
    code: "database_failure",
    requestId: "downstream",
  });
  const app = createBackendApp(async () => undefined, {
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

test("Backend patches Lessons through its client seam", async () => {
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 3,
    version: 2,
    versionPatch: 1,
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
  const incompleteErrors = [
    { path: ["lessonTexts", "th"], message: "A Thai Lesson Text is required." },
    {
      path: ["lessonSources"],
      message: "At least one Lesson Source is required.",
    },
  ];
  const incomplete = new DataServiceError(
    problemDetailsSchema.parse({
      type: "https://ez-dk-citizen.invalid/problems/lesson_publication_incomplete",
      title: "Conflict",
      status: 409,
      detail: "Lesson is missing publication prerequisites.",
      instance: "/internal/lessons/7",
      code: "lesson_publication_incomplete",
      requestId: "downstream",
      errors: incompleteErrors,
    }),
  );
  const changeKindErrors = [
    {
      path: ["changeKind"],
      message:
        "Choose a content change or a fix: this chapter already has a version.",
    },
  ];
  const changeKindRequired = new DataServiceError(
    problemDetailsSchema.parse({
      type: "https://ez-dk-citizen.invalid/problems/validation_failed",
      title: "Unprocessable Content",
      status: 422,
      detail: "A change kind is required to publish this Lesson.",
      instance: "/internal/lessons/7",
      code: "validation_failed",
      requestId: "downstream",
      errors: changeKindErrors,
    }),
  );
  const calls: string[] = [];
  const client = createTestDataServiceClient({
    async patchLesson(id, input, requestId) {
      if (input.chapter === 99) throw conflict;
      if (input.chapter === 98) throw incomplete;
      if (input.chapter === 97) throw changeKindRequired;
      calls.push(`${id}:${JSON.stringify(input)}:${requestId}`);
      return detail;
    },
  });
  const app = createBackendApp(async () => undefined, {
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
    body: JSON.stringify({
      chapter: 3,
      status: "PUBLISHED",
      changeKind: "fix",
    }),
  });
  assert.equal(patched.status, 200);
  assert.deepEqual(await patched.json(), detail);
  assert.deepEqual(calls, [
    '7:{"chapter":3,"status":"PUBLISHED","changeKind":"fix"}:request-6',
  ]);

  for (const body of [
    { chapter: 3, version: 2 },
    { status: "ARCHIVED", changeKind: "fix" },
    { status: "PUBLISHED", changeKind: "major" },
  ]) {
    const refused = await app.request("/api/admin/lessons/7", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    assert.equal(refused.status, 422, JSON.stringify(body));
  }
  assert.equal(calls.length, 1);

  const kindRequired = await app.request("/api/admin/lessons/7", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chapter: 97, status: "PUBLISHED" }),
  });
  assert.equal(kindRequired.status, 422);
  const kindRequiredBody = problemDetailsSchema.parse(
    await kindRequired.json(),
  );
  assert.equal(kindRequiredBody.code, "validation_failed");
  assert.deepEqual(kindRequiredBody.errors, changeKindErrors);

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

  const incompletePublication = await app.request("/api/admin/lessons/7", {
    method: "PATCH",
    headers: {
      Authorization: "Bearer admin-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chapter: 98, status: "PUBLISHED" }),
  });
  assert.equal(incompletePublication.status, 409);
  const incompleteBody = problemDetailsSchema.parse(
    await incompletePublication.json(),
  );
  assert.equal(incompleteBody.code, "lesson_publication_incomplete");
  assert.deepEqual(incompleteBody.errors, incompleteErrors);
});

const deletedKeys = [
  "audio/123e4567-e89b-12d3-a456-426614174001.mp3",
  "audio/123e4567-e89b-12d3-a456-426614174002.mp3",
];
// The Data Service's answer: the Media Assets it marked DELETED.
const deletedMediaAssets = deletedKeys.map((objectKey, index) => ({
  id: 41 + index,
  objectKey,
}));
const unrelatedKey = "audio/123e4567-e89b-12d3-a456-426614174003.mp3";

function deleteDraft(app: ReturnType<typeof createBackendApp>) {
  return app.request("/api/admin/lessons/7", {
    method: "DELETE",
    headers: {
      Authorization: "Bearer admin-token",
      "X-Request-ID": "delete-request",
    },
  });
}

test("deleting a Draft deletes exactly the objects of the Media Assets the Data Service marked DELETED, after it commits", async () => {
  const calls: string[] = [];
  const storage = new FakeStorage();
  for (const key of [...deletedKeys, unrelatedKey])
    storage.putObject(key, { contentType: "audio/mpeg", sizeBytes: 1 });
  const deleteObject = storage.deleteObject.bind(storage);
  storage.deleteObject = async (key) => {
    calls.push(`storage:${key}`);
    await deleteObject(key);
  };
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    dataServiceClient: createTestDataServiceClient({
      async deleteLesson(id, requestId) {
        calls.push(`data:${id}:${requestId}`);
        return { deletedMediaAssets };
      },
    }),
  });

  const unauthorized = await app.request("/api/admin/lessons/7", {
    method: "DELETE",
  });
  assert.equal(unauthorized.status, 401);
  assert.deepEqual(calls, []);

  const response = await deleteDraft(app);

  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");
  assert.deepEqual(calls, [
    "data:7:delete-request",
    ...deletedKeys.map((key) => `storage:${key}`),
  ]);
  await assert.rejects(storage.inspectObject(deletedKeys[0]!));
  assert.deepEqual(await storage.inspectObject(unrelatedKey), {
    contentType: "audio/mpeg",
    sizeBytes: 1,
  });
});

test("a storage failure after the delete commits is logged safely and still answers 204", async () => {
  const deleted: string[] = [];
  const logs: unknown[] = [];
  const storage = new FakeStorage();
  storage.deleteObject = async (key) => {
    if (key === deletedKeys[0])
      throw Object.assign(
        new Error(
          `Bearer admin-token https://storage.invalid/${key}?signature=secret`,
        ),
        { name: "AccessDenied", $metadata: { requestId: "aws-request" } },
      );
    deleted.push(key);
  };
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    storage,
    dataServiceClient: createTestDataServiceClient({
      async deleteLesson() {
        return { deletedMediaAssets };
      },
    }),
  });
  const originalLog = console.log;
  console.log = (entry: unknown) => logs.push(entry);
  let response: Response;
  try {
    response = await deleteDraft(app);
  } finally {
    console.log = originalLog;
  }

  assert.equal(response.status, 204);
  // One failure does not stop the remaining objects from being deleted.
  assert.deepEqual(deleted, [deletedKeys[1]]);
  const failure = logs
    .map((entry) => JSON.parse(String(entry)))
    .find((entry) => entry.operation === "delete");
  assert.deepEqual(failure, {
    requestId: "delete-request",
    operation: "delete",
    mediaAssetId: 41,
    storageErrorCode: "AccessDenied",
    storageRequestId: "aws-request",
  });
  assert.doesNotMatch(
    logs.join("\n"),
    /admin-token|storage\.invalid|signature|audio\//,
  );
});

test("a refused or missing Lesson deletes nothing from storage", async () => {
  for (const [status, code, detail] of [
    [409, "lesson_not_editable", "Only Draft Lessons can be deleted."],
    [404, "lesson_not_found", "Lesson was not found."],
  ] as const) {
    const storage = new FakeStorage();
    storage.deleteObject = async () => {
      throw new Error("nothing may be deleted");
    };
    const app = createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      storage,
      dataServiceClient: createTestDataServiceClient({
        async deleteLesson() {
          throw new DataServiceError(
            problemDetailsSchema.parse({
              type: `https://ez-dk-citizen.invalid/problems/${code}`,
              title: "Problem",
              status,
              detail,
              instance: "/internal/lessons/7",
              code,
              requestId: "downstream",
            }),
          );
        },
      }),
    });

    const response = await deleteDraft(app);

    assert.equal(response.status, status);
    const problem = await response.json();
    assert.equal(problem.code, code);
    assert.equal(problem.detail, detail);
  }
});
