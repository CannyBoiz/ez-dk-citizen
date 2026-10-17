import assert from "node:assert/strict";
import { after, test } from "node:test";
import {
  lessonDetailSchema,
  publishedLessonDetailSchema,
} from "@ez-dk-citizen/api-contracts";
import { createDataModule } from "@ez-dk-citizen/data";
import { resetDatabaseBetweenTests } from "@ez-dk-citizen/data/testing";

import { createBackendApp } from "../../app.js";
import { FakeStorage } from "../../storage.js";

resetDatabaseBetweenTests();
const data = createDataModule(String(process.env.DATABASE_URL), 2_000);
after(() => data.close());
const app = createBackendApp(async () => undefined, {
  adminApiToken: "admin-token",
  data,
  storage: new FakeStorage(),
});
const headers = {
  Authorization: "Bearer admin-token",
  "Content-Type": "application/json",
};

test("Admin API Sources preserve canonical URL identity", async () => {
  const unauthorized = await app.request("/api/admin/sources", {
    method: "POST",
  });
  assert.equal(unauthorized.status, 401);

  const invalid = await app.request("/api/admin/sources", {
    method: "POST",
    headers,
    body: JSON.stringify({ url: "/source", publishedAt: null }),
  });
  assert.equal(invalid.status, 422);

  const created = await app.request("/api/admin/sources", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: " https://example.com/source ",
      publishedAt: "2026-01-01T02:00:00+02:00",
    }),
  });
  assert.equal(created.status, 201);
  const first = await created.json();
  assert.equal(
    created.headers.get("location"),
    `/api/admin/sources/${first.id}`,
  );
  assert.equal(first.url, "https://example.com/source");
  assert.equal(first.publishedAt, "2026-01-01T00:00:00.000Z");

  const duplicate = await app.request("/api/admin/sources", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: "https://example.com/source",
      publishedAt: null,
    }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "source_url_conflict");

  const distinct = await app.request("/api/admin/sources", {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: "https://example.com/source/",
      publishedAt: null,
    }),
  });
  assert.equal(distinct.status, 201);
  const second = await distinct.json();

  const listed = await app.request("/api/admin/sources", { headers });
  assert.equal(listed.status, 200);
  assert.deepEqual(
    (await listed.json()).items.map((item: { id: number }) => item.id),
    [first.id, second.id],
  );
});

test("Admin API Source updates correct a Source cited by a Published Lesson without touching it", async () => {
  const createSource = async (url: string, publishedAt: string | null) =>
    (
      await app.request("/api/admin/sources", {
        method: "POST",
        headers,
        body: JSON.stringify({ url, publishedAt }),
      })
    ).json();
  const typo = await createSource(
    "https://example.com/tpyo",
    "2025-03-09T00:00:00.000Z",
  );
  const other = await createSource("https://example.com/other", null);
  // Lesson routes still call the Data Service, so the Lesson is set up and read
  // through the data module.
  const lesson = await data.createLesson({ chapter: 75 });
  await data.upsertLessonText(lesson.id, "th", {
    title: "Title",
    content: "Content",
  });
  await data.upsertLessonSource(lesson.id, typo.id, { pageFrom: 3 });
  const published = lessonDetailSchema.parse(
    await data.patchLesson(lesson.id, { status: "PUBLISHED" }),
  );
  const update = (id: number | string, body: unknown) =>
    app.request(`/api/admin/sources/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    });

  assert.equal(
    (
      await app.request(`/api/admin/sources/${typo.id}`, {
        method: "PATCH",
        body: "{}",
      })
    ).status,
    401,
  );

  const moved = await update(typo.id, { url: " https://example.com/typo " });
  assert.equal(moved.status, 200);
  assert.deepEqual(await moved.json(), {
    id: typo.id,
    url: "https://example.com/typo",
    publishedAt: "2025-03-09T00:00:00.000Z",
  });

  const undated = await update(typo.id, { publishedAt: null });
  assert.equal(undated.status, 200);
  assert.deepEqual(await undated.json(), {
    id: typo.id,
    url: "https://example.com/typo",
    publishedAt: null,
  });

  const both = await update(typo.id, {
    url: "https://example.com/fixed",
    publishedAt: "2025-03-10T02:00:00+02:00",
  });
  assert.equal(both.status, 200);
  assert.deepEqual(await both.json(), {
    id: typo.id,
    url: "https://example.com/fixed",
    publishedAt: "2025-03-10T00:00:00.000Z",
  });

  const conflict = await update(typo.id, { url: other.url });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).code, "source_url_conflict");

  const invalid = await update(typo.id, { url: "ftp://example.com" });
  assert.equal(invalid.status, 422);
  assert.deepEqual(
    (await invalid.json()).errors.map(
      (entry: { path: string[] }) => entry.path,
    ),
    [["url"]],
  );

  const missing = await update(999_999, { publishedAt: null });
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "source_not_found");

  const detail = lessonDetailSchema.parse(await data.getLesson(lesson.id));
  assert.equal(detail.updatedAt, published.updatedAt);
  assert.deepEqual(detail.lessonSources, [
    {
      id: typo.id,
      url: "https://example.com/fixed",
      publishedAt: "2025-03-10T00:00:00.000Z",
      pageFrom: 3,
      pageTo: null,
      sectionReference: null,
    },
  ]);
  const thai = publishedLessonDetailSchema.parse(
    await data.getPublishedLesson(lesson.id, "th"),
  );
  assert.equal(thai.updatedAt, published.updatedAt);
  assert.deepEqual(
    thai.lessonSources.map(({ url }) => url),
    ["https://example.com/fixed"],
  );
  assert.deepEqual(
    (
      await (await app.request("/api/admin/sources", { headers })).json()
    ).items.map(({ url }: { url: string }) => url),
    ["https://example.com/fixed", other.url],
  );
});
