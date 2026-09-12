import assert from "node:assert/strict";
import { test } from "node:test";

import { createDataApp } from "../app.js";
import { useIntegrationDatabase } from "./integration-test-database.js";

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
