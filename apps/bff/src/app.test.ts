import {
  lessonDetailSchema,
  livenessResponseSchema,
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
  const client: DataServiceClient = {
    async createLesson(input, requestId) {
      calls.push(`create:${input.chapter}:${input.version}:${requestId}`);
      return detail;
    },
    async upsertLessonText() {
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
    async createSource() {
      return sourceResponseSchema.parse({
        id: 1,
        url: "https://example.com",
        publishedAt: null,
      });
    },
    async listSources() {
      return { items: [] };
    },
  };
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
    dataServiceClient: {
      async createLesson() {
        throw new DataServiceError(details);
      },
      async upsertLessonText() {
        throw new DataServiceError(details);
      },
      async listLessons() {
        throw new DataServiceError(details);
      },
      async getLesson() {
        throw new DataServiceError(details);
      },
      async createSource() {
        throw new DataServiceError(details);
      },
      async listSources() {
        throw new DataServiceError(details);
      },
    },
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
  const client = {
    async createLesson() {
      return detail;
    },
    async listLessons() {
      return { items: [] };
    },
    async getLesson() {
      return detail;
    },
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
    async createSource() {
      return sourceResponseSchema.parse({
        id: 1,
        url: "https://example.com",
        publishedAt: null,
      });
    },
    async listSources() {
      return { items: [] };
    },
  };
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
    dataServiceClient: {
      async createLesson() {
        throw new DataServiceError(details);
      },
      async upsertLessonText() {
        throw new DataServiceError(details);
      },
      async listLessons() {
        throw new DataServiceError(details);
      },
      async getLesson() {
        throw new DataServiceError(details);
      },
      async createSource() {
        throw new DataServiceError(details);
      },
      async listSources() {
        throw new DataServiceError(details);
      },
    },
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
  const client: DataServiceClient = {
    async createLesson() {
      throw new Error("not used");
    },
    async upsertLessonText() {
      throw new Error("not used");
    },
    async listLessons() {
      return { items: [] };
    },
    async getLesson() {
      throw new Error("not used");
    },
    async createSource(input, requestId) {
      if (input.url.endsWith("conflict")) throw conflict;
      calls.push(`${input.url}:${input.publishedAt}:${requestId}`);
      return source;
    },
    async listSources(requestId) {
      calls.push(`list:${requestId}`);
      return { items: [source] };
    },
  };
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
