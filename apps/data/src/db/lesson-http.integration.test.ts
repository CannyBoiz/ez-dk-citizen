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
    body: JSON.stringify({ url: "https://example.com/first", publishedAt: null }),
  });
  const firstSource = await firstSourceResponse.json();
  const secondSourceResponse = await app.request("/internal/sources", {
    method: "POST",
    headers,
    body: JSON.stringify({ url: "https://example.com/second", publishedAt: null }),
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
    withTwoSources.lessonSources.map(
      (item: { id: number }) => item.id,
    ),
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
  const afterRepeatedDetach = await app.request(`/internal/lessons/${lesson.id}`, {
    headers: { Authorization: "Bearer data-token" },
  });
  assert.equal((await afterRepeatedDetach.json()).updatedAt, detachedDetail.updatedAt);
});
