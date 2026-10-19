import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lessonDetailSchema,
  problemDetailsSchema,
} from "@ez-dk-citizen/api-contracts";

import { createBackendApp } from "../../app.js";
import { createTestDataModule } from "../../testing/data-module.js";

test("Backend replaces and detaches Draft Lesson Sources through the data module", async (context) => {
  const log = context.mock.method(console, "log", () => undefined);
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 2,
    version: null,
    versionPatch: null,
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
  const calls: string[] = [];
  const data = createTestDataModule({
    async upsertLessonSource(lessonId, sourceId, input) {
      if (sourceId === 99) return "source_not_found";
      calls.push(`${lessonId}:${sourceId}:${input.pageFrom}`);
      return detail;
    },
    async deleteLessonSource(lessonId, sourceId) {
      calls.push(`delete:${lessonId}:${sourceId}`);
      return undefined;
    },
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    data,
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
  const attachedLog = JSON.parse(String(log.mock.calls.at(-1)?.arguments[0]));
  assert.equal(
    attachedLog.path,
    "/api/admin/lessons/:lessonId/sources/:sourceId",
  );
  assert.equal(attachedLog.requestId, "request-4");
  assert.equal(attachedLog.method, "PUT");
  assert.equal(attachedLog.status, 200);

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
  const detachedLog = JSON.parse(String(log.mock.calls.at(-1)?.arguments[0]));
  assert.equal(
    detachedLog.path,
    "/api/admin/lessons/:lessonId/sources/:sourceId",
  );
  assert.equal(detachedLog.requestId, "request-5");
  assert.equal(detachedLog.method, "DELETE");
  assert.equal(detachedLog.status, 204);
  assert.deepEqual(calls, ["7:3:2", "delete:7:3"]);
});

test("Backend maps Lesson Source refusals from the data module", async () => {
  // The refusal the data module answers for each Lesson.
  const refusals = {
    1: "lesson_not_found",
    2: "lesson_not_editable",
    3: "source_not_found",
  } as const;
  const data = createTestDataModule({
    async upsertLessonSource(lessonId) {
      return refusals[lessonId as keyof typeof refusals];
    },
    async deleteLessonSource(lessonId) {
      return refusals[lessonId as keyof typeof refusals];
    },
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    data,
  });

  for (const method of ["PUT", "DELETE"]) {
    for (const [lessonId, status, code, detail] of [
      [1, 404, "lesson_not_found", "Lesson was not found."],
      [2, 409, "lesson_not_editable", "Only Draft Lessons can be edited."],
      [3, 404, "source_not_found", "Source was not found."],
    ] as const) {
      const refused = await app.request(
        `/api/admin/lessons/${lessonId}/sources/3`,
        {
          method,
          headers: {
            Authorization: "Bearer admin-token",
            "Content-Type": "application/json",
          },
          ...(method === "PUT" ? { body: "{}" } : {}),
        },
      );
      assert.equal(refused.status, status, `${method} ${code}`);
      const problem = problemDetailsSchema.parse(await refused.json());
      assert.equal(problem.code, code);
      assert.equal(problem.detail, detail);
    }
  }
});
