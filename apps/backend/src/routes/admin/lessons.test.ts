import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lessonDetailSchema,
  problemDetailsSchema,
} from "@ez-dk-citizen/api-contracts";
import { type DataModule, fail, ok } from "@ez-dk-citizen/data";

import { createBackendApp } from "../../app.js";
import { FakeStorage } from "../../storage.js";
import { createTestDataModule } from "../../testing/data-module.js";

test("admin Lesson routes authenticate and use the data module", async () => {
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
  const data = createTestDataModule({
    async createLesson(input) {
      calls.push(`create:${JSON.stringify(input)}`);
      return ok(detail);
    },
    async listLessons(status) {
      calls.push(`list:${status}`);
      return { items: [summary] };
    },
    async getLesson(id, filters) {
      calls.push(`get:${id}:${JSON.stringify(filters)}`);
      return id === 99 ? fail("lesson_not_found") : ok(detail);
    },
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    adminOrigins: ["https://admin.example"],
    data,
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

  const missing = await app.request("/api/admin/lessons/99", {
    headers: { Authorization: "Bearer admin-token" },
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get("content-type"), "application/problem+json");
  const missingProblem = problemDetailsSchema.parse(await missing.json());
  assert.equal(missingProblem.code, "lesson_not_found");
  assert.equal(missingProblem.detail, "Lesson was not found.");
  assert.deepEqual(calls, [
    'create:{"chapter":2}',
    "list:undefined",
    "get:7:undefined",
    "get:99:undefined",
  ]);

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

test("Backend upserts a localized Lesson Text through the data module", async () => {
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
  const data = createTestDataModule({
    async upsertLessonText(lessonId, languageCode, input) {
      if (lessonId === 404) return fail("lesson_not_found");
      if (lessonId === 409) return fail("lesson_not_editable");
      if (languageCode === "zz") return fail("unsupported_language");
      calls.push(`${lessonId}:${languageCode}:${input.title}:${input.content}`);
      return ok(detail);
    },
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    data,
  });
  const upsert = (path: string) =>
    app.request(path, {
      method: "PUT",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "บท", content: "เนื้อหา" }),
    });

  const response = await upsert("/api/admin/lessons/7/texts/th");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), detail);
  assert.deepEqual(calls, ["7:th:บท:เนื้อหา"]);

  const invalidId = await upsert("/api/admin/lessons/0/texts/th");
  assert.equal(invalidId.status, 422);
  assert.ok(problemDetailsSchema.parse(await invalidId.json()).errors?.length);

  for (const [path, status, code, detail] of [
    [
      "/api/admin/lessons/404/texts/th",
      404,
      "lesson_not_found",
      "Lesson was not found.",
    ],
    [
      "/api/admin/lessons/409/texts/th",
      409,
      "lesson_not_editable",
      "Only Draft Lessons can be edited.",
    ],
    [
      "/api/admin/lessons/7/texts/zz",
      422,
      "unsupported_language",
      "Language is not supported.",
    ],
  ] as const) {
    const refused = await upsert(path);
    assert.equal(refused.status, status, path);
    const problem = problemDetailsSchema.parse(await refused.json());
    assert.equal(problem.code, code);
    assert.equal(problem.detail, detail);
  }
  assert.equal(calls.length, 1);
});

test("Backend creates a new version through the data module and maps its refusals", async () => {
  const copy = lessonDetailSchema.parse({
    id: 8,
    chapter: 3,
    version: null,
    versionPatch: null,
    status: "DRAFT",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    availableLanguageCodes: ["th"],
    lessonTexts: [{ languageCode: "th", title: "ไทย", content: "เนื้อหา" }],
    lessonSources: [],
  });
  const calls: string[] = [];
  const data = createTestDataModule({
    async createLesson(input) {
      calls.push(JSON.stringify(input));
      if (!("copyFromLessonId" in input)) throw new Error("not a copy");
      return input.copyFromLessonId === 90
        ? fail("lesson_not_found")
        : input.copyFromLessonId === 91
          ? fail("lesson_not_copyable")
          : ok(copy);
    },
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    data,
  });
  const create = (body: unknown) =>
    app.request("/api/admin/lessons", {
      method: "POST",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

  const created = await create({ copyFromLessonId: 7 });
  assert.equal(created.status, 201);
  assert.equal(created.headers.get("location"), "/api/admin/lessons/8");
  assert.deepEqual(await created.json(), copy);

  for (const [copyFromLessonId, status, code, detail] of [
    [90, 404, "lesson_not_found", "Lesson was not found."],
    [
      91,
      409,
      "lesson_not_copyable",
      "Only Published and Archived Lessons can be copied.",
    ],
  ] as const) {
    const refused = await create({ copyFromLessonId });
    assert.equal(refused.status, status, code);
    assert.equal(refused.headers.get("location"), null);
    const problem = problemDetailsSchema.parse(await refused.json());
    assert.equal(problem.code, code);
    assert.equal(problem.detail, detail);
  }

  for (const body of [
    { copyFromLessonId: 0 },
    { copyFromLessonId: 7, chapter: 3 },
  ]) {
    assert.equal((await create(body)).status, 422, JSON.stringify(body));
  }
  assert.deepEqual(calls, [
    '{"copyFromLessonId":7}',
    '{"copyFromLessonId":90}',
    '{"copyFromLessonId":91}',
  ]);
});

test("Backend patches Lessons through the data module and maps every refusal", async () => {
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
  const missing = [
    { path: ["lessonTexts", "th"], message: "A Thai Lesson Text is required." },
    {
      path: ["lessonSources"],
      message: "At least one Lesson Source is required.",
    },
  ];
  // The refusal the data module answers for each chapter.
  const refusals: Record<
    number,
    Awaited<ReturnType<DataModule["patchLesson"]>>
  > = {
    90: fail("lesson_not_found"),
    91: fail("lesson_not_editable"),
    92: fail("lesson_lifecycle_conflict"),
    93: fail("unsupported_language"),
    94: fail("change_kind_required"),
    95: fail("published_lesson_conflict"),
    96: fail("lesson_version_conflict"),
    97: { ...fail("lesson_publication_incomplete"), missing },
    98: fail("lesson_unchanged"),
  };
  const calls: string[] = [];
  const data = createTestDataModule({
    async patchLesson(id, input) {
      const refusal = refusals[input.chapter ?? 0];
      if (refusal) return refusal;
      calls.push(`${id}:${JSON.stringify(input)}`);
      return ok(detail);
    },
  });
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    data,
  });
  const patch = (body: unknown) =>
    app.request("/api/admin/lessons/7", {
      method: "PATCH",
      headers: {
        Authorization: "Bearer admin-token",
        "Content-Type": "application/json",
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  assert.equal((await patch("{}")).status, 422);

  const patched = await patch({
    chapter: 3,
    status: "PUBLISHED",
    changeKind: "fix",
    replacesLessonId: 6,
  });
  assert.equal(patched.status, 200);
  assert.deepEqual(await patched.json(), detail);
  assert.deepEqual(calls, [
    '7:{"chapter":3,"status":"PUBLISHED","changeKind":"fix","replacesLessonId":6}',
  ]);

  for (const body of [
    { chapter: 3, version: 2 },
    { status: "ARCHIVED", changeKind: "fix" },
    { status: "PUBLISHED", changeKind: "major" },
    { status: "ARCHIVED", replacesLessonId: 6 },
    { status: "PUBLISHED", replacesLessonId: "6" },
  ]) {
    assert.equal((await patch(body)).status, 422, JSON.stringify(body));
  }
  assert.equal(calls.length, 1);

  for (const [chapter, status, code, detail, errors] of [
    [90, 404, "lesson_not_found", "Lesson was not found."],
    [91, 409, "lesson_not_editable", "Only Draft Lessons can be edited."],
    [
      92,
      409,
      "lesson_lifecycle_conflict",
      "Lesson status transition is not allowed.",
    ],
    [93, 422, "unsupported_language", "Language is not supported."],
    [
      94,
      422,
      "validation_failed",
      "A change kind is required to publish this Lesson.",
      [
        {
          path: ["changeKind"],
          message:
            "Choose a content change or a fix: this chapter already has a version.",
        },
      ],
    ],
    [
      95,
      409,
      "published_lesson_conflict",
      "This publication does not replace the chapter's current Published Lesson.",
    ],
    [
      96,
      409,
      "lesson_version_conflict",
      "A Lesson with this chapter and version already exists.",
    ],
    [
      97,
      409,
      "lesson_publication_incomplete",
      "Lesson is missing publication prerequisites.",
      missing,
    ],
    [
      98,
      409,
      "lesson_unchanged",
      "The Draft's Lesson Texts and Lesson Sources are identical to the Published Lesson's.",
    ],
  ] as const) {
    const refused = await patch({ chapter, status: "PUBLISHED" });
    assert.equal(refused.status, status, code);
    const problem = problemDetailsSchema.parse(await refused.json());
    assert.equal(problem.code, code);
    assert.equal(problem.detail, detail);
    assert.deepEqual(problem.errors, errors);
  }
  assert.equal(calls.length, 1);
});

const deletedKeys = [
  "audio/123e4567-e89b-12d3-a456-426614174001.mp3",
  "audio/123e4567-e89b-12d3-a456-426614174002.mp3",
];
// The data module's answer: the Media Assets it marked DELETED.
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

test("deleting a Draft deletes exactly the objects of the Media Assets the data module marked DELETED, after it commits", async () => {
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
    data: createTestDataModule({
      async deleteLesson(id) {
        calls.push(`data:${id}`);
        return ok({ deletedMediaAssets });
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
    "data:7",
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
    data: createTestDataModule({
      async deleteLesson() {
        return ok({ deletedMediaAssets });
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
      data: createTestDataModule({
        async deleteLesson() {
          return fail(code);
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
