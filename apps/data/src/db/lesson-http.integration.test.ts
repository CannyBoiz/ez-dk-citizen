import assert from "node:assert/strict";
import { test } from "node:test";
import { eq } from "drizzle-orm";

import { createDataApp } from "../app.js";
import { useIntegrationDatabase } from "./integration-test-database.js";
import { lessonAudio, lesson as lessonTable, mediaAsset } from "./schema.js";

const database = useIntegrationDatabase();
const app = createDataApp(async () => undefined, {
  database,
  dataServiceToken: "data-token",
});

test("internal Media Asset creation validates Language and persists an unbound pending asset", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const unsupported = await app.request("/internal/media-assets", {
    method: "POST",
    headers,
    body: JSON.stringify({
      languageCode: "zz",
      storageProvider: "s3",
      storageContainer: "citizenship-audio",
      objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    }),
  });
  assert.equal(unsupported.status, 422);
  assert.equal((await unsupported.json()).code, "unsupported_language");

  const created = await app.request("/internal/media-assets", {
    method: "POST",
    headers,
    body: JSON.stringify({
      languageCode: "th",
      storageProvider: "s3",
      storageContainer: "citizenship-audio",
      objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 50 * 1024 * 1024,
    }),
  });
  assert.equal(created.status, 201);
  const asset = await created.json();
  assert.deepEqual(
    {
      status: asset.status,
      sizeBytes: asset.sizeBytes,
      durationMs: asset.durationMs,
      uploadedAt: asset.uploadedAt,
    },
    {
      status: "PENDING",
      sizeBytes: 50 * 1024 * 1024,
      durationMs: null,
      uploadedAt: null,
    },
  );
  assert.equal(
    (
      await database.query.mediaAsset.findFirst({
        where: { id: asset.id },
        with: { lessonAudio: true },
      })
    )?.lessonAudio,
    null,
  );
});

test("internal Media Asset completion makes the first matching Lesson Audio current", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const lessonResponse = await app.request("/internal/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ chapter: 70 }),
  });
  const lesson = await lessonResponse.json();
  const localized = await app.request(
    `/internal/lessons/${lesson.id}/texts/th`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: "บท", content: "เนื้อหา" }),
    },
  );
  const before = await localized.json();
  const pending = await app.request("/internal/media-assets", {
    method: "POST",
    headers,
    body: JSON.stringify({
      languageCode: "th",
      storageProvider: "s3",
      storageContainer: "citizenship-audio",
      objectKey: "audio/123e4567-e89b-12d3-a456-426614174001.mp3",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    }),
  });
  const asset = await pending.json();

  const completed = await app.request(
    `/internal/media-assets/${asset.id}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ lessonId: lesson.id, languageCode: "th" }),
    },
  );

  assert.equal(completed.status, 200);
  const result = await completed.json();
  assert.deepEqual(Object.keys(result.mediaAsset).sort(), [
    "contentType",
    "durationMs",
    "id",
    "sizeBytes",
    "status",
    "uploadedAt",
  ]);
  assert.deepEqual(result.lessonAudio, {
    id: result.lessonAudio.id,
    lessonId: lesson.id,
    languageCode: "th",
    audioVersion: 1,
    isCurrent: true,
    createdAt: result.lessonAudio.createdAt,
  });
  assert.equal(result.mediaAsset.status, "READY");
  assert.equal(result.mediaAsset.id, asset.id);

  const [storedAsset] = await database
    .select()
    .from(mediaAsset)
    .where(eq(mediaAsset.id, asset.id));
  const [storedAudio] = await database
    .select()
    .from(lessonAudio)
    .where(eq(lessonAudio.mediaAssetId, asset.id));
  const [storedLesson] = await database
    .select()
    .from(lessonTable)
    .where(eq(lessonTable.id, lesson.id));
  assert.equal(storedAsset?.status, "READY");
  assert.ok(storedAsset?.uploadedAt);
  assert.equal(storedAudio?.audioVersion, 1);
  assert.equal(storedAudio?.isCurrent, true);
  assert.notEqual(storedLesson?.updatedAt.toISOString(), before.updatedAt);
});

test("internal Media Asset failure is terminal", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const pending = await app.request("/internal/media-assets", {
    method: "POST",
    headers,
    body: JSON.stringify({
      languageCode: "th",
      storageProvider: "s3",
      storageContainer: "citizenship-audio",
      objectKey: "audio/123e4567-e89b-12d3-a456-426614174002.mp3",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    }),
  });
  const asset = await pending.json();

  const failed = await app.request(`/internal/media-assets/${asset.id}/fail`, {
    method: "POST",
    headers,
  });
  assert.equal(failed.status, 204);
  assert.equal(
    (
      await database
        .select({ status: mediaAsset.status })
        .from(mediaAsset)
        .where(eq(mediaAsset.id, asset.id))
    )[0]?.status,
    "FAILED",
  );

  const retry = await app.request(
    `/internal/media-assets/${asset.id}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ lessonId: 1, languageCode: "th" }),
    },
  );
  assert.equal(retry.status, 409);
  assert.equal((await retry.json()).code, "media_asset_failed");
});

test("internal Media Asset completion promotes corrections and returns matching retries", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const createdLesson = await app.request("/internal/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ chapter: 71 }),
  });
  const lesson = await createdLesson.json();
  for (const languageCode of ["th", "da"]) {
    await app.request(`/internal/lessons/${lesson.id}/texts/${languageCode}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: "Title", content: "Content" }),
    });
  }
  const createAsset = (key: string) =>
    app.request("/internal/media-assets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        languageCode: "th",
        storageProvider: "s3",
        storageContainer: "citizenship-audio",
        objectKey: key,
        originalFilename: "lesson.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 1,
      }),
    });
  const complete = (id: number, languageCode = "th") =>
    app.request(`/internal/media-assets/${id}/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ lessonId: lesson.id, languageCode }),
    });

  const firstAsset = await (
    await createAsset("audio/123e4567-e89b-12d3-a456-426614174010.mp3")
  ).json();
  const first = await complete(firstAsset.id);
  assert.equal(first.status, 200);
  const firstResult = await first.json();
  assert.equal(firstResult.lessonAudio.audioVersion, 1);

  const firstRetry = await complete(firstAsset.id);
  assert.equal(firstRetry.status, 200);
  assert.deepEqual(await firstRetry.json(), firstResult);

  const source = await (
    await app.request("/internal/sources", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: "https://example.com/corrections",
        publishedAt: null,
      }),
    })
  ).json();
  await app.request(`/internal/lessons/${lesson.id}/sources/${source.id}`, {
    method: "PUT",
    headers,
    body: "{}",
  });
  const published = await app.request(`/internal/lessons/${lesson.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "PUBLISHED" }),
  });
  const beforeCorrection = await published.json();
  const secondAsset = await (
    await createAsset("audio/123e4567-e89b-12d3-a456-426614174011.mp3")
  ).json();
  const second = await complete(secondAsset.id);
  assert.equal(second.status, 200);
  const secondResult = await second.json();
  assert.equal(secondResult.lessonAudio.audioVersion, 2);
  assert.equal(secondResult.lessonAudio.isCurrent, true);

  const history = await database
    .select({
      mediaAssetId: lessonAudio.mediaAssetId,
      audioVersion: lessonAudio.audioVersion,
      isCurrent: lessonAudio.isCurrent,
    })
    .from(lessonAudio)
    .where(eq(lessonAudio.lessonId, lesson.id))
    .orderBy(lessonAudio.audioVersion);
  assert.deepEqual(history, [
    { mediaAssetId: firstAsset.id, audioVersion: 1, isCurrent: false },
    { mediaAssetId: secondAsset.id, audioVersion: 2, isCurrent: true },
  ]);
  const afterCorrection = await app.request(`/internal/lessons/${lesson.id}`, {
    headers,
  });
  const afterCorrectionBody = await afterCorrection.json();
  assert.ok(
    Date.parse(afterCorrectionBody.updatedAt) >
      Date.parse(beforeCorrection.updatedAt),
  );

  const secondRetry = await complete(secondAsset.id);
  assert.equal(secondRetry.status, 200);
  assert.deepEqual(await secondRetry.json(), secondResult);
  const afterRetry = await app.request(`/internal/lessons/${lesson.id}`, {
    headers,
  });
  assert.equal(
    (await afterRetry.json()).updatedAt,
    afterCorrectionBody.updatedAt,
  );

  const supersededRetry = await complete(firstAsset.id);
  assert.equal(supersededRetry.status, 200);
  assert.deepEqual(await supersededRetry.json(), {
    ...firstResult,
    lessonAudio: { ...firstResult.lessonAudio, isCurrent: false },
  });
  assert.deepEqual(
    await database
      .select({
        mediaAssetId: lessonAudio.mediaAssetId,
        audioVersion: lessonAudio.audioVersion,
        isCurrent: lessonAudio.isCurrent,
      })
      .from(lessonAudio)
      .where(eq(lessonAudio.lessonId, lesson.id))
      .orderBy(lessonAudio.audioVersion),
    history,
  );

  const rebind = await complete(firstAsset.id, "da");
  assert.equal(rebind.status, 409);
  assert.equal((await rebind.json()).code, "media_asset_rebind_conflict");

  const archivedLesson = await app.request("/internal/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ chapter: 73 }),
  });
  const archived = await archivedLesson.json();
  await app.request(`/internal/lessons/${archived.id}/texts/th`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ title: "Title", content: "Content" }),
  });
  await app.request(`/internal/lessons/${archived.id}/sources/${source.id}`, {
    method: "PUT",
    headers,
    body: "{}",
  });
  for (const status of ["PUBLISHED", "ARCHIVED"]) {
    const transitioned = await app.request(`/internal/lessons/${archived.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status }),
    });
    assert.equal(transitioned.status, 200);
  }
  const archivedAsset = await (
    await createAsset("audio/123e4567-e89b-12d3-a456-426614174012.mp3")
  ).json();
  const archivedCompletion = await app.request(
    `/internal/media-assets/${archivedAsset.id}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ lessonId: archived.id, languageCode: "th" }),
    },
  );
  assert.equal(archivedCompletion.status, 409);
  assert.equal((await archivedCompletion.json()).code, "lesson_archived");
});

test("internal Media Asset completion rolls back every promotion write", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const lessonResponse = await app.request("/internal/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ chapter: 72 }),
  });
  const lesson = await lessonResponse.json();
  await app.request(`/internal/lessons/${lesson.id}/texts/th`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ title: "Title", content: "Content" }),
  });
  const createAsset = (key: string) =>
    app.request("/internal/media-assets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        languageCode: "th",
        storageProvider: "s3",
        storageContainer: "citizenship-audio",
        objectKey: key,
        originalFilename: "lesson.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 1,
      }),
    });
  const currentAsset = await (
    await createAsset("audio/123e4567-e89b-12d3-a456-426614174013.mp3")
  ).json();
  await app.request(`/internal/media-assets/${currentAsset.id}/complete`, {
    method: "POST",
    headers,
    body: JSON.stringify({ lessonId: lesson.id, languageCode: "th" }),
  });
  const before = await (
    await app.request(`/internal/lessons/${lesson.id}`, { headers })
  ).json();
  const assetResponse = await createAsset(
    "audio/123e4567-e89b-12d3-a456-426614174014.mp3",
  );
  const asset = await assetResponse.json();
  const rollbackApp = createDataApp(async () => undefined, {
    database: new Proxy(database, {
      get(target, property, receiver) {
        if (property === "transaction") {
          return async (callback: any) =>
            target.transaction(async (transaction) => {
              await callback(transaction);
              throw new Error("forced rollback");
            });
        }
        return Reflect.get(target, property, receiver);
      },
    }),
    dataServiceToken: "data-token",
  });

  const response = await rollbackApp.request(
    `/internal/media-assets/${asset.id}/complete`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ lessonId: lesson.id, languageCode: "th" }),
    },
  );
  assert.equal(response.status, 500);
  assert.equal(
    (
      await database
        .select({ status: mediaAsset.status })
        .from(mediaAsset)
        .where(eq(mediaAsset.id, asset.id))
    )[0]?.status,
    "PENDING",
  );
  assert.equal(
    (
      await database
        .select({ id: lessonAudio.id })
        .from(lessonAudio)
        .where(eq(lessonAudio.mediaAssetId, asset.id))
    ).length,
    0,
  );
  assert.deepEqual(
    await database
      .select({
        mediaAssetId: lessonAudio.mediaAssetId,
        isCurrent: lessonAudio.isCurrent,
      })
      .from(lessonAudio)
      .where(eq(lessonAudio.lessonId, lesson.id)),
    [{ mediaAssetId: currentAsset.id, isCurrent: true }],
  );
  const after = await app.request(`/internal/lessons/${lesson.id}`, {
    headers,
  });
  assert.equal((await after.json()).updatedAt, before.updatedAt);
});

test("internal Media Asset completion serializes concurrent corrections", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const lessonResponse = await app.request("/internal/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ chapter: 74 }),
  });
  const lesson = await lessonResponse.json();
  await app.request(`/internal/lessons/${lesson.id}/texts/th`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ title: "Title", content: "Content" }),
  });
  const createAsset = (key: string) =>
    app.request("/internal/media-assets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        languageCode: "th",
        storageProvider: "s3",
        storageContainer: "citizenship-audio",
        objectKey: key,
        originalFilename: "lesson.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 1,
      }),
    });
  const [firstAsset, secondAsset] = await Promise.all(
    [
      "audio/123e4567-e89b-12d3-a456-426614174015.mp3",
      "audio/123e4567-e89b-12d3-a456-426614174016.mp3",
    ].map(async (key) => (await createAsset(key)).json()),
  );
  const completions = await Promise.all(
    [firstAsset, secondAsset].map((asset) =>
      app.request(`/internal/media-assets/${asset.id}/complete`, {
        method: "POST",
        headers,
        body: JSON.stringify({ lessonId: lesson.id, languageCode: "th" }),
      }),
    ),
  );
  assert.deepEqual(
    completions.map(({ status }) => status),
    [200, 200],
  );
  const history = await database
    .select({
      mediaAssetId: lessonAudio.mediaAssetId,
      audioVersion: lessonAudio.audioVersion,
      isCurrent: lessonAudio.isCurrent,
    })
    .from(lessonAudio)
    .where(eq(lessonAudio.lessonId, lesson.id))
    .orderBy(lessonAudio.audioVersion);
  assert.deepEqual(
    history.map(({ audioVersion, isCurrent }) => ({ audioVersion, isCurrent })),
    [
      { audioVersion: 1, isCurrent: false },
      { audioVersion: 2, isCurrent: true },
    ],
  );
  assert.deepEqual(
    history.map(({ mediaAssetId }) => mediaAssetId).sort(),
    [firstAsset.id, secondAsset.id].sort(),
  );
});

test("Published localized detail returns only the requested current ready audio", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const created = await app.request("/internal/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ chapter: 74 }),
  });
  const lesson = await created.json();
  for (const languageCode of ["th", "da"]) {
    await app.request(`/internal/lessons/${lesson.id}/texts/${languageCode}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: "Title", content: "Content" }),
    });
  }
  const createAsset = (key: string) =>
    app.request("/internal/media-assets", {
      method: "POST",
      headers,
      body: JSON.stringify({
        languageCode: "th",
        storageProvider: "s3",
        storageContainer: "citizenship-audio",
        objectKey: key,
        originalFilename: "lesson.mp3",
        contentType: "audio/mpeg",
        sizeBytes: 1,
      }),
    });
  const complete = (id: number) =>
    app.request(`/internal/media-assets/${id}/complete`, {
      method: "POST",
      headers,
      body: JSON.stringify({ lessonId: lesson.id, languageCode: "th" }),
    });

  const first = await (
    await createAsset("audio/123e4567-e89b-12d3-a456-426614174074.mp3")
  ).json();
  assert.equal((await complete(first.id)).status, 200);
  const source = await (
    await app.request("/internal/sources", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: "https://example.com/current-audio",
        publishedAt: null,
      }),
    })
  ).json();
  await app.request(`/internal/lessons/${lesson.id}/sources/${source.id}`, {
    method: "PUT",
    headers,
    body: "{}",
  });
  assert.equal(
    (
      await app.request(`/internal/lessons/${lesson.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "PUBLISHED" }),
      })
    ).status,
    200,
  );
  const secondKey = "audio/123e4567-e89b-12d3-a456-426614174075.mp3";
  const second = await (await createAsset(secondKey)).json();
  const secondCompletion = await complete(second.id);
  assert.equal(secondCompletion.status, 200);
  assert.equal((await secondCompletion.json()).lessonAudio.audioVersion, 2);
  const retry = await complete(second.id);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).lessonAudio.audioVersion, 2);

  const thai = await app.request(
    `/internal/lessons/${lesson.id}?status=PUBLISHED&language=th`,
    { headers },
  );
  assert.equal(thai.status, 200);
  assert.deepEqual((await thai.json()).currentAudio, {
    mediaAssetId: second.id,
    audioVersion: 2,
    objectKey: secondKey,
    contentType: "audio/mpeg",
    sizeBytes: 1,
    durationMs: null,
  });
  const danish = await app.request(
    `/internal/lessons/${lesson.id}?status=PUBLISHED&language=da`,
    { headers },
  );
  assert.equal((await danish.json()).currentAudio, null);
  const list = await app.request(
    "/internal/lessons?status=PUBLISHED&language=th",
    {
      headers,
    },
  );
  assert.equal(
    "currentAudio" in
      (await list.json()).items.find(
        (item: { id: number }) => item.id === lesson.id,
      ),
    false,
  );
  const history = await database
    .select({
      audioVersion: lessonAudio.audioVersion,
      isCurrent: lessonAudio.isCurrent,
    })
    .from(lessonAudio)
    .where(eq(lessonAudio.lessonId, lesson.id))
    .orderBy(lessonAudio.audioVersion);
  assert.deepEqual(history, [
    { audioVersion: 1, isCurrent: false },
    { audioVersion: 2, isCurrent: true },
  ]);
});

test("internal localized reads filter by status and return Lesson aggregates", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const createLesson = async (chapter: number) => {
    const response = await app.request("/internal/lessons", {
      method: "POST",
      headers,
      body: JSON.stringify({ chapter }),
    });
    assert.equal(response.status, 201);
    return response.json();
  };

  const published = await createLesson(50);
  const localized = await app.request(
    `/internal/lessons/${published.id}/texts/th`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: "บท", content: "เนื้อหา" }),
    },
  );
  assert.equal(localized.status, 200);
  const source = await (
    await app.request("/internal/sources", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: "https://example.com/localized-reads",
        publishedAt: null,
      }),
    })
  ).json();
  await app.request(`/internal/lessons/${published.id}/sources/${source.id}`, {
    method: "PUT",
    headers,
    body: "{}",
  });
  const publish = await app.request(`/internal/lessons/${published.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ status: "PUBLISHED" }),
  });
  assert.equal(publish.status, 200);

  const hidden = await createLesson(51);
  const filteredList = await app.request(
    "/internal/lessons?status=PUBLISHED&language=th",
    { headers: { Authorization: "Bearer data-token" } },
  );
  assert.equal(filteredList.status, 200);
  const filteredItems = (await filteredList.json()).items;
  assert.deepEqual(
    filteredItems.find((item: { id: number }) => item.id === published.id),
    {
      id: published.id,
      chapter: 50,
      version: 1,
      versionPatch: 0,
      status: "PUBLISHED",
      createdAt: published.createdAt,
      updatedAt: (await publish.json()).updatedAt,
      availableLanguageCodes: ["th"],
      lessonTexts: [{ languageCode: "th", title: "บท", content: "เนื้อหา" }],
      lessonSources: [
        {
          id: source.id,
          url: source.url,
          publishedAt: null,
          pageFrom: null,
          pageTo: null,
          sectionReference: null,
        },
      ],
    },
  );

  const hiddenDetail = await app.request(
    `/internal/lessons/${hidden.id}?status=PUBLISHED`,
    { headers: { Authorization: "Bearer data-token" } },
  );
  assert.equal(hiddenDetail.status, 404);
  assert.equal((await hiddenDetail.json()).code, "lesson_not_found");

  const statusOnlyList = await app.request(
    "/internal/lessons?status=PUBLISHED",
    {
      headers: { Authorization: "Bearer data-token" },
    },
  );
  assert.equal(statusOnlyList.status, 200);
  assert.equal(
    (await statusOnlyList.json()).items.some(
      (item: { id: number }) => item.id === hidden.id,
    ),
    false,
  );

  for (const path of [
    "/internal/lessons?status=",
    `/internal/lessons/${published.id}?language=`,
  ]) {
    const response = await app.request(path, {
      headers: { Authorization: "Bearer data-token" },
    });
    assert.equal(response.status, 422);
    const details = await response.json();
    assert.equal(details.code, "validation_failed");
    assert.ok(details.errors?.length);
  }
});

test("internal current Lesson Audio reads the current ready rendition in every Lesson status", async () => {
  const headers = {
    Authorization: "Bearer data-token",
    "Content-Type": "application/json",
  };
  const created = await app.request("/internal/lessons", {
    method: "POST",
    headers,
    body: JSON.stringify({ chapter: 76 }),
  });
  const lesson = await created.json();
  const readAudio = (languageCode: string, id = lesson.id) =>
    app.request(`/internal/lessons/${id}/audio/${languageCode}`, { headers });
  for (const languageCode of ["th", "da"]) {
    await app.request(`/internal/lessons/${lesson.id}/texts/${languageCode}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ title: "Title", content: "Content" }),
    });
  }
  const upload = async (key: string, originalFilename: string) => {
    const asset = await (
      await app.request("/internal/media-assets", {
        method: "POST",
        headers,
        body: JSON.stringify({
          languageCode: "th",
          storageProvider: "s3",
          storageContainer: "citizenship-audio",
          objectKey: key,
          originalFilename,
          contentType: "audio/mpeg",
          sizeBytes: 2048,
        }),
      })
    ).json();
    const completed = await app.request(
      `/internal/media-assets/${asset.id}/complete`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ lessonId: lesson.id, languageCode: "th" }),
      },
    );
    assert.equal(completed.status, 200);
    return asset.id as number;
  };

  const none = await readAudio("th");
  assert.equal(none.status, 200);
  assert.deepEqual(await none.json(), { audio: null });
  assert.deepEqual(await (await readAudio("en")).json(), { audio: null });

  const unsupported = await readAudio("zz");
  assert.equal(unsupported.status, 422);
  assert.equal((await unsupported.json()).code, "unsupported_language");
  const missing = await readAudio("th", 987654);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, "lesson_not_found");

  const firstKey = "audio/123e4567-e89b-12d3-a456-426614174076.mp3";
  const first = await upload(firstKey, "first.mp3");
  assert.deepEqual(await (await readAudio("th")).json(), {
    audio: {
      mediaAssetId: first,
      audioVersion: 1,
      originalFilename: "first.mp3",
      objectKey: firstKey,
      contentType: "audio/mpeg",
      sizeBytes: 2048,
      durationMs: null,
    },
  });

  const secondKey = "audio/123e4567-e89b-12d3-a456-426614174077.mp3";
  const second = await upload(secondKey, "second.mp3");
  const current = {
    audio: {
      mediaAssetId: second,
      audioVersion: 2,
      originalFilename: "second.mp3",
      objectKey: secondKey,
      contentType: "audio/mpeg",
      sizeBytes: 2048,
      durationMs: null,
    },
  };
  assert.deepEqual(await (await readAudio("th")).json(), current);
  assert.deepEqual(await (await readAudio("da")).json(), { audio: null });

  const source = await (
    await app.request("/internal/sources", {
      method: "POST",
      headers,
      body: JSON.stringify({
        url: "https://example.com/admin-current-audio",
        publishedAt: null,
      }),
    })
  ).json();
  await app.request(`/internal/lessons/${lesson.id}/sources/${source.id}`, {
    method: "PUT",
    headers,
    body: "{}",
  });
  for (const status of ["PUBLISHED", "ARCHIVED"]) {
    const patched = await app.request(`/internal/lessons/${lesson.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status }),
    });
    assert.equal(patched.status, 200);
    assert.deepEqual(await (await readAudio("th")).json(), current);
  }

  await database
    .update(mediaAsset)
    .set({ status: "DELETED" })
    .where(eq(mediaAsset.id, second));
  assert.deepEqual(await (await readAudio("th")).json(), { audio: null });
});
