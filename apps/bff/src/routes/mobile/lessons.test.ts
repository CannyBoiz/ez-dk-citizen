import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lessonDetailSchema,
  problemDetailsSchema,
  publishedLessonDetailSchema,
} from "@ez-dk-citizen/api-contracts";

import { createBffApp } from "../../app.js";
import { DataServiceError } from "../../data-service/client.js";
import { FakeStorage } from "../../storage.js";
import { createTestDataServiceClient } from "../../testing/data-service-client.js";

test("BFF composes localized mobile responses from Lesson aggregates", async () => {
  const detail = lessonDetailSchema.parse({
    id: 7,
    chapter: 2,
    version: 1,
    status: "PUBLISHED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    availableLanguageCodes: ["da", "th"],
    lessonTexts: [
      { languageCode: "da", title: "Dansk", content: "Indhold" },
      { languageCode: "th", title: "ไทย", content: "เนื้อหา" },
    ],
    lessonSources: [
      {
        id: 3,
        url: "https://example.com/source",
        publishedAt: null,
        pageFrom: 2,
        pageTo: 3,
        sectionReference: null,
      },
    ],
  });
  const nextLesson = lessonDetailSchema.parse({
    ...detail,
    id: 8,
    chapter: 3,
    lessonTexts: [{ languageCode: "th", title: "ถัดไป", content: "ต่อไป" }],
  });
  const untranslatedLesson = lessonDetailSchema.parse({
    ...detail,
    id: 9,
    chapter: 4,
    lessonTexts: [
      { languageCode: "da", title: "Kun dansk", content: "Indhold" },
    ],
  });
  const unsupportedLanguage = new DataServiceError(
    problemDetailsSchema.parse({
      type: "https://ez-dk-citizen.invalid/problems/unsupported_language",
      title: "Unprocessable Content",
      status: 422,
      detail: "Language is not supported.",
      instance: "/internal/lessons",
      code: "unsupported_language",
      requestId: "downstream",
    }),
  );
  const publishedDetail = publishedLessonDetailSchema.parse({
    ...detail,
    currentAudio: null,
  });
  const calls: string[] = [];
  const client = createTestDataServiceClient({
    async listPublishedLessons(languageCode: string, requestId: string) {
      calls.push(`list:${languageCode}:${requestId}`);
      if (languageCode === "xx") throw unsupportedLanguage;
      return { items: [detail, nextLesson, untranslatedLesson] };
    },
    async getPublishedLesson(
      id: number,
      languageCode: string,
      requestId: string,
    ) {
      calls.push(`detail:${id}:${languageCode}:${requestId}`);
      return publishedDetail;
    },
  });
  const app = createBffApp(async () => undefined, {
    dataServiceClient: client,
  });

  const list = await app.request("/api/mobile/lessons", {
    headers: { "X-Request-ID": "mobile-list" },
  });
  assert.equal(list.status, 200);
  assert.deepEqual(await list.json(), {
    items: [
      {
        id: 7,
        chapter: 2,
        version: 1,
        languageCode: "th",
        title: "ไทย",
      },
      {
        id: 8,
        chapter: 3,
        version: 1,
        languageCode: "th",
        title: "ถัดไป",
      },
    ],
  });

  const explicitList = await app.request("/api/mobile/lessons?language=da", {
    headers: { "X-Request-ID": "mobile-da" },
  });
  assert.equal(explicitList.status, 200);
  assert.deepEqual(await explicitList.json(), {
    items: [
      {
        id: 7,
        chapter: 2,
        version: 1,
        languageCode: "da",
        title: "Dansk",
      },
      {
        id: 9,
        chapter: 4,
        version: 1,
        languageCode: "da",
        title: "Kun dansk",
      },
    ],
  });

  const inspected = await app.request("/api/mobile/lessons/7?language=da", {
    headers: { "X-Request-ID": "mobile-detail" },
  });
  assert.equal(inspected.status, 200);
  assert.deepEqual(await inspected.json(), {
    id: 7,
    chapter: 2,
    version: 1,
    languageCode: "da",
    title: "Dansk",
    content: "Indhold",
    availableLanguageCodes: ["da", "th"],
    lessonSources: detail.lessonSources,
    audio: null,
  });

  const emptyLanguage = await app.request("/api/mobile/lessons?language=");
  assert.equal(emptyLanguage.status, 422);
  assert.ok(
    problemDetailsSchema.parse(await emptyLanguage.json()).errors?.length,
  );
  const unsupported = await app.request("/api/mobile/lessons?language=xx");
  assert.equal(unsupported.status, 422);
  assert.equal((await unsupported.json()).code, "unsupported_language");
  assert.deepEqual(calls.slice(0, 3), [
    "list:th:mobile-list",
    "list:da:mobile-da",
    "detail:7:da:mobile-detail",
  ]);
  assert.match(calls[3]!, /^list:xx:[\da-f-]{36}$/);
});

test("BFF returns fresh, allow-listed playback authorization for current mobile audio", async () => {
  const lesson = publishedLessonDetailSchema.parse({
    id: 7,
    chapter: 2,
    version: 1,
    status: "PUBLISHED",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:01:00.000Z",
    availableLanguageCodes: ["th"],
    lessonTexts: [{ languageCode: "th", title: "ไทย", content: "เนื้อหา" }],
    lessonSources: [],
    currentAudio: {
      mediaAssetId: 9,
      audioVersion: 2,
      objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
      durationMs: null,
    },
  });
  const storage = new FakeStorage();
  const keys: string[] = [];
  storage.inspectObject = async () => {
    throw new Error("Playback must not inspect object metadata");
  };
  storage.createPlaybackAuthorization = async (key) => {
    keys.push(key);
    return {
      playbackUrl: `https://storage.invalid/playback-${keys.length}`,
      expiresAt: "2026-01-01T01:00:00.000Z",
    };
  };
  const app = createBffApp(async () => undefined, {
    storage,
    dataServiceClient: createTestDataServiceClient({
      async getPublishedLesson() {
        return lesson;
      },
    }),
  });

  const first = await app.request("/api/mobile/lessons/7", {
    headers: { "X-Request-ID": "mobile-playback" },
  });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "no-store");
  const firstBody = await first.json();
  assert.deepEqual(Object.keys(firstBody.audio).sort(), [
    "audioVersion",
    "contentType",
    "durationMs",
    "mediaAssetId",
    "playbackExpiresAt",
    "playbackUrl",
    "sizeBytes",
  ]);
  assert.equal(firstBody.audio.audioVersion, 2);
  assert.equal(
    firstBody.audio.playbackUrl,
    "https://storage.invalid/playback-1",
  );
  assert.equal(
    Date.parse(firstBody.audio.playbackExpiresAt) -
      Date.parse("2026-01-01T00:00:00.000Z"),
    60 * 60 * 1_000,
  );

  const second = await app.request("/api/mobile/lessons/7");
  assert.equal(
    (await second.json()).audio.playbackUrl,
    "https://storage.invalid/playback-2",
  );
  assert.ok(lesson.currentAudio);
  assert.deepEqual(keys, [
    lesson.currentAudio.objectKey,
    lesson.currentAudio.objectKey,
  ]);

  const missingText = await app.request("/api/mobile/lessons/7?language=da");
  assert.equal(missingText.status, 404);
  assert.equal((await missingText.json()).code, "lesson_text_not_found");
  assert.equal(keys.length, 2);
});

test("BFF keeps playback-signing failures correlated and storage-safe", async () => {
  const key = "audio/123e4567-e89b-12d3-a456-426614174000.mp3";
  const storage = new FakeStorage();
  storage.createPlaybackAuthorization = async () => {
    throw Object.assign(
      new Error(`failed ${key} https://storage.invalid/leak`),
      {
        name: "SlowDown",
      },
    );
  };
  const app = createBffApp(async () => undefined, {
    storage,
    dataServiceClient: createTestDataServiceClient({
      async getPublishedLesson() {
        return publishedLessonDetailSchema.parse({
          id: 7,
          chapter: 2,
          version: 1,
          status: "PUBLISHED",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:01:00.000Z",
          availableLanguageCodes: ["th"],
          lessonTexts: [{ languageCode: "th", title: "ไทย", content: "เนื้อหา" }],
          lessonSources: [],
          currentAudio: {
            mediaAssetId: 9,
            audioVersion: 2,
            objectKey: key,
            contentType: "audio/mpeg",
            sizeBytes: 1,
            durationMs: null,
          },
        });
      },
    }),
  });

  const response = await app.request("/api/mobile/lessons/7", {
    headers: { "X-Request-ID": "playback-failure" },
  });
  assert.equal(response.status, 503);
  const body = await response.text();
  assert.equal(JSON.parse(body).code, "storage_unavailable");
  assert.equal(JSON.parse(body).requestId, "playback-failure");
  assert.equal(body.includes(key), false);
  assert.equal(body.includes("storage.invalid"), false);
});
