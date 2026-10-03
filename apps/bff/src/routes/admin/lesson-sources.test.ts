import {
  lessonDetailSchema,
  problemDetailsSchema,
} from "@ez-dk-citizen/api-contracts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createBffApp } from "../../app.js";
import { DataServiceError } from "../../data-service/client.js";
import { createTestDataServiceClient } from "../../testing/data-service-client.js";

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
