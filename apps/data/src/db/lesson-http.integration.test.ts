import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";

import { createDataApp } from "../app.js";
import { useIntegrationDatabase } from "./integration-test-database.js";
import { lesson as lessonTable } from "./schema.js";

const database = useIntegrationDatabase();
const app = createDataApp(async () => undefined, {
  database,
  dataServiceToken: "data-token",
});

test("internal Lesson HTTP operations persist and return aggregate transport shapes", async () => {
  const unauthorized = await app.request("/internal/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chapter: 1, version: 1 }),
  });
  assert.equal(unauthorized.status, 401);

  const unauthorizedRead = await app.request("/internal/lessons/1");
  assert.equal(unauthorizedRead.status, 401);

  const created = await app.request("/internal/lessons", {
    method: "POST",
    headers: {
      Authorization: "Bearer data-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chapter: 1, version: 1, status: "PUBLISHED" }),
  });
  assert.equal(created.status, 422);

  const valid = await app.request("/internal/lessons", {
    method: "POST",
    headers: {
      Authorization: "Bearer data-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chapter: 1, version: 1 }),
  });
  assert.equal(valid.status, 201);
  const detail = await valid.json();
  assert.equal(detail.status, "DRAFT");
  assert.deepEqual(detail.availableLanguageCodes, []);
  assert.deepEqual(detail.lessonTexts, []);
  assert.deepEqual(detail.lessonSources, []);

  const text = await app.request(`/internal/lessons/${detail.id}/texts/th`, {
    method: "PUT",
    headers: {
      Authorization: "Bearer data-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "บท", content: "เนื้อหา" }),
  });
  assert.equal(text.status, 200);
  const localized = await text.json();
  assert.deepEqual(localized.availableLanguageCodes, ["th"]);
  assert.deepEqual(localized.lessonTexts, [
    { languageCode: "th", title: "บท", content: "เนื้อหา" },
  ]);
  assert.notEqual(localized.updatedAt, detail.updatedAt);

  const replacement = await app.request(
    `/internal/lessons/${detail.id}/texts/th`,
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer data-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "แทนที่", content: "เนื้อหาใหม่" }),
    },
  );
  assert.equal(replacement.status, 200);
  assert.deepEqual((await replacement.json()).lessonTexts, [
    { languageCode: "th", title: "แทนที่", content: "เนื้อหาใหม่" },
  ]);

  const unsupported = await app.request(
    `/internal/lessons/${detail.id}/texts/xx`,
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer data-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Title", content: "Content" }),
    },
  );
  assert.equal(unsupported.status, 422);
  assert.equal((await unsupported.json()).code, "unsupported_language");

  const missingTextLesson = await app.request(
    "/internal/lessons/999999/texts/th",
    {
      method: "PUT",
      headers: {
        Authorization: "Bearer data-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Title", content: "Content" }),
    },
  );
  assert.equal(missingTextLesson.status, 404);
  assert.equal((await missingTextLesson.json()).code, "lesson_not_found");

  const duplicate = await app.request("/internal/lessons", {
    method: "POST",
    headers: {
      Authorization: "Bearer data-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chapter: 1, version: 1 }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "lesson_version_conflict");

  const list = await app.request("/internal/lessons", {
    headers: { Authorization: "Bearer data-token" },
  });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).items[0].id, detail.id);

  const inspected = await app.request(`/internal/lessons/${detail.id}`, {
    headers: { Authorization: "Bearer data-token" },
  });
  assert.equal(inspected.status, 200);
  assert.equal((await inspected.json()).id, detail.id);

  const missing = await app.request("/internal/lessons/999999", {
    headers: { Authorization: "Bearer data-token" },
  });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "lesson_not_found");
});

test("internal Source HTTP operations preserve canonical URL identity", async () => {
  const unauthorized = await app.request("/internal/sources", {
    method: "POST",
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await app.request("/internal/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer data-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: "/source", publishedAt: null }),
  });
  assert.equal(invalid.status, 422);

  const created = await app.request("/internal/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer data-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: " https://example.com/source ",
      publishedAt: "2026-01-01T02:00:00+02:00",
    }),
  });
  assert.equal(created.status, 201);
  const first = await created.json();
  assert.equal(first.url, "https://example.com/source");
  assert.equal(first.publishedAt, "2026-01-01T00:00:00.000Z");

  const duplicate = await app.request("/internal/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer data-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://example.com/source",
      publishedAt: null,
    }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "source_url_conflict");

  const distinct = await app.request("/internal/sources", {
    method: "POST",
    headers: {
      Authorization: "Bearer data-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: "https://example.com/source/",
      publishedAt: null,
    }),
  });
  assert.equal(distinct.status, 201);
  const second = await distinct.json();

  const listed = await app.request("/internal/sources", {
    headers: { Authorization: "Bearer data-token" },
  });
  assert.equal(listed.status, 200);
  assert.deepEqual(
    (await listed.json()).items.map((item: { id: number }) => item.id),
    [first.id, second.id],
  );
});

test("internal Lesson Source operations replace locators and detach safely", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const lessonResponse = await app.request("/internal/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ chapter: 2, version: 1 }),
  });
  const lesson = await lessonResponse.json();

  const firstSourceResponse = await app.request("/internal/sources", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: "https://example.com/first",
      publishedAt: null,
    }),
  });
  const firstSource = await firstSourceResponse.json();
  const secondSourceResponse = await app.request("/internal/sources", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: "https://example.com/second",
      publishedAt: null,
    }),
  });
  const secondSource = await secondSourceResponse.json();

  const invalid = await app.request(
    `/internal/lessons/${lesson.id}/sources/${firstSource.id}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ pageFrom: 2, pageTo: 1 }),
    },
  );
  assert.equal(invalid.status, 422);

  const attached = await app.request(
    `/internal/lessons/${lesson.id}/sources/${firstSource.id}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({
        pageFrom: 2,
        pageTo: 3,
        sectionReference: "section 1",
      }),
    },
  );
  assert.equal(attached.status, 200);
  const attachedDetail = await attached.json();
  assert.deepEqual(attachedDetail.lessonSources, [
    {
      id: firstSource.id,
      url: firstSource.url,
      publishedAt: null,
      pageFrom: 2,
      pageTo: 3,
      sectionReference: "section 1",
    },
  ]);
  assert.notEqual(attachedDetail.updatedAt, lesson.updatedAt);

  const replaced = await app.request(
    `/internal/lessons/${lesson.id}/sources/${firstSource.id}`,
    { method: "PUT", headers, body: "{}" },
  );
  assert.equal(replaced.status, 200);
  const replacedDetail = await replaced.json();
  assert.deepEqual(replacedDetail.lessonSources[0], {
    id: firstSource.id,
    url: firstSource.url,
    publishedAt: null,
    pageFrom: null,
    pageTo: null,
    sectionReference: null,
  });
  assert.notEqual(replacedDetail.updatedAt, attachedDetail.updatedAt);

  const secondAttachment = await app.request(
    `/internal/lessons/${lesson.id}/sources/${secondSource.id}`,
    { method: "PUT", headers, body: "{}" },
  );
  assert.equal(secondAttachment.status, 200);
  const withTwoSources = await secondAttachment.json();
  assert.deepEqual(
    withTwoSources.lessonSources.map((item: { id: number }) => item.id),
    [firstSource.id, secondSource.id],
  );

  const secondLessonResponse = await app.request("/internal/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ chapter: 2, version: 2 }),
  });
  const secondLesson = await secondLessonResponse.json();
  const reused = await app.request(
    `/internal/lessons/${secondLesson.id}/sources/${firstSource.id}`,
    { method: "PUT", headers, body: "{}" },
  );
  assert.equal(reused.status, 200);
  assert.equal((await reused.json()).lessonSources[0].id, firstSource.id);

  await database
    .update(lessonTable)
    .set({ status: "PUBLISHED" })
    .where(eq(lessonTable.id, secondLesson.id));
  const blocked = await app.request(
    `/internal/lessons/${secondLesson.id}/sources/${secondSource.id}`,
    { method: "PUT", headers, body: "{}" },
  );
  assert.equal(blocked.status, 409);
  assert.equal((await blocked.json()).code, "lesson_not_editable");

  const detached = await app.request(
    `/internal/lessons/${lesson.id}/sources/${firstSource.id}`,
    { method: "DELETE", headers: { Authorization: "Bearer data-token" } },
  );
  assert.equal(detached.status, 204);
  const afterDetach = await app.request(`/internal/lessons/${lesson.id}`, {
    headers: { Authorization: "Bearer data-token" },
  });
  const detachedDetail = await afterDetach.json();
  assert.deepEqual(
    detachedDetail.lessonSources.map((item: { id: number }) => item.id),
    [secondSource.id],
  );
  assert.notEqual(detachedDetail.updatedAt, withTwoSources.updatedAt);

  const repeatedDetach = await app.request(
    `/internal/lessons/${lesson.id}/sources/${firstSource.id}`,
    { method: "DELETE", headers: { Authorization: "Bearer data-token" } },
  );
  assert.equal(repeatedDetach.status, 204);
  const afterRepeatedDetach = await app.request(
    `/internal/lessons/${lesson.id}`,
    {
      headers: { Authorization: "Bearer data-token" },
    },
  );
  assert.equal(
    (await afterRepeatedDetach.json()).updatedAt,
    detachedDetail.updatedAt,
  );
});

test("internal Lesson patches enforce lifecycle and immutable history", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const createLesson = async (chapter: number, version: number) => {
    const response = await app.request("/internal/lessons", {
      method: "POST",
      headers,
      body: JSON.stringify({ chapter, version }),
    });
    assert.equal(response.status, 201);
    return response.json();
  };
  const patchLesson = (id: number, body: unknown) =>
    app.request(`/internal/lessons/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });

  const draft = await createLesson(10, 1);
  const structured = await patchLesson(draft.id, { chapter: 11, version: 2 });
  assert.equal(structured.status, 200);
  const structuredDetail = await structured.json();
  assert.equal(structuredDetail.chapter, 11);
  assert.equal(structuredDetail.version, 2);
  assert.notEqual(structuredDetail.updatedAt, draft.updatedAt);

  const repeatedDraft = await patchLesson(draft.id, { status: "DRAFT" });
  assert.equal(repeatedDraft.status, 409);
  assert.equal((await repeatedDraft.json()).code, "lesson_lifecycle_conflict");

  const sourceResponse = await app.request("/internal/sources", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: "https://example.com/immutable",
      publishedAt: null,
    }),
  });
  const source = await sourceResponse.json();
  const draftSource = await app.request(
    `/internal/lessons/${draft.id}/sources/${source.id}`,
    { method: "PUT", headers, body: "{}" },
  );
  assert.equal(draftSource.status, 200);
  const published = await patchLesson(draft.id, {
    chapter: 12,
    version: 3,
    status: "PUBLISHED",
  });
  assert.equal(published.status, 200);
  const publishedDetail = await published.json();
  assert.equal(publishedDetail.status, "PUBLISHED");
  assert.equal(publishedDetail.chapter, 12);
  assert.equal(publishedDetail.version, 3);

  const textAfterPublication = await app.request(
    `/internal/lessons/${draft.id}/texts/th`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: "Titel", content: "Indhold" }),
    },
  );
  assert.equal(textAfterPublication.status, 409);
  assert.equal((await textAfterPublication.json()).code, "lesson_not_editable");
  const sourceReplacementAfterPublication = await app.request(
    `/internal/lessons/${draft.id}/sources/${source.id}`,
    { method: "PUT", headers, body: JSON.stringify({ pageFrom: 2 }) },
  );
  assert.equal(sourceReplacementAfterPublication.status, 409);
  assert.equal(
    (await sourceReplacementAfterPublication.json()).code,
    "lesson_not_editable",
  );
  const sourceDetachAfterPublication = await app.request(
    `/internal/lessons/${draft.id}/sources/${source.id}`,
    { method: "DELETE", headers: { Authorization: "Bearer data-token" } },
  );
  assert.equal(sourceDetachAfterPublication.status, 409);
  assert.equal(
    (await sourceDetachAfterPublication.json()).code,
    "lesson_not_editable",
  );

  const structureAfterPublication = await patchLesson(draft.id, {
    chapter: 13,
  });
  assert.equal(structureAfterPublication.status, 409);
  assert.equal(
    (await structureAfterPublication.json()).code,
    "lesson_not_editable",
  );
  const repeatedPublish = await patchLesson(draft.id, { status: "PUBLISHED" });
  assert.equal(repeatedPublish.status, 409);
  assert.equal(
    (await repeatedPublish.json()).code,
    "lesson_lifecycle_conflict",
  );
  const publishedToDraft = await patchLesson(draft.id, { status: "DRAFT" });
  assert.equal(publishedToDraft.status, 409);
  assert.equal(
    (await publishedToDraft.json()).code,
    "lesson_lifecycle_conflict",
  );

  const archived = await patchLesson(draft.id, { status: "ARCHIVED" });
  assert.equal(archived.status, 200);
  assert.equal((await archived.json()).status, "ARCHIVED");
  const repeatedArchive = await patchLesson(draft.id, { status: "ARCHIVED" });
  assert.equal(repeatedArchive.status, 409);
  assert.equal(
    (await repeatedArchive.json()).code,
    "lesson_lifecycle_conflict",
  );
  for (const status of ["DRAFT", "PUBLISHED"] as const) {
    const rejected = await patchLesson(draft.id, { status });
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).code, "lesson_lifecycle_conflict");
  }
  const textAfterArchive = await app.request(
    `/internal/lessons/${draft.id}/texts/th`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: "Titel", content: "Indhold" }),
    },
  );
  assert.equal(textAfterArchive.status, 409);
  assert.equal((await textAfterArchive.json()).code, "lesson_not_editable");
  const sourceAfterArchive = await app.request(
    `/internal/lessons/${draft.id}/sources/${source.id}`,
    { method: "PUT", headers, body: "{}" },
  );
  assert.equal(sourceAfterArchive.status, 409);
  assert.equal((await sourceAfterArchive.json()).code, "lesson_not_editable");
  const detachAfterArchive = await app.request(
    `/internal/lessons/${draft.id}/sources/${source.id}`,
    { method: "DELETE", headers: { Authorization: "Bearer data-token" } },
  );
  assert.equal(detachAfterArchive.status, 409);
  assert.equal((await detachAfterArchive.json()).code, "lesson_not_editable");

  const draftToArchive = await createLesson(20, 1);
  const directArchive = await patchLesson(draftToArchive.id, {
    status: "ARCHIVED",
  });
  assert.equal(directArchive.status, 200);
  assert.equal((await directArchive.json()).status, "ARCHIVED");

  const publishedVersion = await createLesson(30, 1);
  assert.equal(
    (await patchLesson(publishedVersion.id, { status: "PUBLISHED" })).status,
    200,
  );
  const competing = await createLesson(30, 2);
  const beforeCompetingPublish = await app.request(
    `/internal/lessons/${competing.id}`,
    {
      headers: { Authorization: "Bearer data-token" },
    },
  );
  const beforeCompetingDetail = await beforeCompetingPublish.json();
  const competingPublish = await patchLesson(competing.id, {
    status: "PUBLISHED",
  });
  assert.equal(competingPublish.status, 409);
  assert.equal(
    (await competingPublish.json()).code,
    "published_lesson_conflict",
  );
  const afterCompetingPublish = await app.request(
    `/internal/lessons/${competing.id}`,
    {
      headers: { Authorization: "Bearer data-token" },
    },
  );
  assert.deepEqual(await afterCompetingPublish.json(), beforeCompetingDetail);

  await createLesson(40, 1);
  const rollback = await createLesson(41, 1);
  const beforeRollback = await app.request(`/internal/lessons/${rollback.id}`, {
    headers: { Authorization: "Bearer data-token" },
  });
  const beforeRollbackDetail = await beforeRollback.json();
  const failedCombinedPatch = await patchLesson(rollback.id, {
    chapter: 40,
    version: 1,
    status: "PUBLISHED",
  });
  assert.equal(failedCombinedPatch.status, 409);
  assert.equal(
    (await failedCombinedPatch.json()).code,
    "lesson_version_conflict",
  );
  const afterRollback = await app.request(`/internal/lessons/${rollback.id}`, {
    headers: { Authorization: "Bearer data-token" },
  });
  assert.deepEqual(await afterRollback.json(), beforeRollbackDetail);
});
