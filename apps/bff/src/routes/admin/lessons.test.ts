import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lessonDetailSchema,
  problemDetailsSchema,
} from "@ez-dk-citizen/api-contracts";

import { createBffApp } from "../../app.js";
import { DataServiceError } from "../../data-service/client.js";
import { createTestDataServiceClient } from "../../testing/data-service-client.js";

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
  const calls: string[] = [];
  const client = createTestDataServiceClient({
    async patchLesson(id, input, requestId) {
      if (input.chapter === 99) throw conflict;
      if (input.chapter === 98) throw incomplete;
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
