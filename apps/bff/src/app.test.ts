import {
  lessonDetailSchema,
  livenessResponseSchema,
  problemDetailsSchema,
  readinessResponseSchema,
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
    async listLessons(requestId) {
      calls.push(`list:${requestId}`);
      return { items: [summary] };
    },
    async getLesson(id, requestId) {
      calls.push(`get:${id}:${requestId}`);
      return detail;
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
      async listLessons() {
        throw new DataServiceError(details);
      },
      async getLesson() {
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
      async listLessons() {
        throw new DataServiceError(details);
      },
      async getLesson() {
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
