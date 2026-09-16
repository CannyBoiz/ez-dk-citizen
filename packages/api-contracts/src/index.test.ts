import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSourceRequestSchema,
  createLessonRequestSchema,
  createPendingMediaAssetRequestSchema,
  createUploadIntentRequestSchema,
  completeMediaAssetRequestSchema,
  completeMediaAssetResponseSchema,
  lessonDetailSchema,
  lessonIdParamsSchema,
  mediaAssetIdParamsSchema,
  lessonReadQuerySchema,
  livenessResponseSchema,
  mobileLessonDetailSchema,
  publishedLessonDetailSchema,
  readinessResponseSchema,
  patchLessonRequestSchema,
  problemDetailsSchema,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
  uploadIntentResponseSchema,
} from "./index.js";

test("health contracts reject response drift", () => {
  assert.deepEqual(livenessResponseSchema.parse({ status: "ok" }), {
    status: "ok",
  });
  assert.deepEqual(readinessResponseSchema.parse({ status: "unavailable" }), {
    status: "unavailable",
  });
  assert.throws(() => livenessResponseSchema.parse({ status: "unavailable" }));
  assert.throws(() => readinessResponseSchema.parse({ status: "unknown" }));
});

test("path, query, and Problem Details contracts are strict", () => {
  assert.deepEqual(lessonIdParamsSchema.parse({ lessonId: "7" }), {
    lessonId: 7,
  });
  assert.deepEqual(mediaAssetIdParamsSchema.parse({ mediaAssetId: "9" }), {
    mediaAssetId: 9,
  });
  assert.deepEqual(
    lessonReadQuerySchema.parse({ status: "PUBLISHED", language: "th" }),
    { status: "PUBLISHED", language: "th" },
  );
  assert.throws(() => lessonIdParamsSchema.parse({ lessonId: "0" }));
  assert.throws(() =>
    mediaAssetIdParamsSchema.parse({ mediaAssetId: "not-an-id" }),
  );
  assert.throws(() => lessonReadQuerySchema.parse({ status: "" }));
  assert.throws(() =>
    problemDetailsSchema.parse({ status: 422, code: "validation_failed" }),
  );
});

test("Upload Intent contracts accept only one safe declared MP3", () => {
  const input = {
    lessonId: 7,
    languageCode: "th",
    originalFilename: "lesson.mp3",
    contentType: "audio/mpeg",
    sizeBytes: 50 * 1024 * 1024,
  };
  assert.deepEqual(createUploadIntentRequestSchema.parse(input), input);
  assert.throws(() =>
    createUploadIntentRequestSchema.parse({ ...input, sizeBytes: 0 }),
  );
  assert.throws(() =>
    createUploadIntentRequestSchema.parse({
      ...input,
      sizeBytes: 50 * 1024 * 1024 + 1,
    }),
  );
  assert.throws(() =>
    createUploadIntentRequestSchema.parse({
      ...input,
      originalFilename: "lesson.wav",
    }),
  );
  assert.throws(() =>
    createUploadIntentRequestSchema.parse({ ...input, extra: true }),
  );

  assert.deepEqual(
    createPendingMediaAssetRequestSchema.parse({
      languageCode: "th",
      storageProvider: "s3",
      storageContainer: "citizenship-audio",
      objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    }).sizeBytes,
    1,
  );
  assert.deepEqual(
    uploadIntentResponseSchema.parse({
      mediaAssetId: 1,
      uploadUrl: "https://bucket.example/audio.mp3",
      uploadHeaders: {
        "Content-Type": "audio/mpeg",
        "Content-Length": "1",
        "If-None-Match": "*",
      },
      expiresAt: "2026-01-01T00:15:00.000Z",
    }).mediaAssetId,
    1,
  );
});

test("Media Asset completion contracts keep storage locators internal", () => {
  const completion = {
    mediaAsset: {
      id: 1,
      status: "READY",
      contentType: "audio/mpeg",
      sizeBytes: 1,
      durationMs: null,
      uploadedAt: "2026-01-01T00:00:00.000Z",
    },
    lessonAudio: {
      id: 2,
      lessonId: 7,
      languageCode: "th",
      audioVersion: 1,
      isCurrent: true,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  };
  assert.deepEqual(
    completeMediaAssetRequestSchema.parse({ lessonId: 7, languageCode: "th" }),
    { lessonId: 7, languageCode: "th" },
  );
  assert.deepEqual(
    completeMediaAssetResponseSchema.parse(completion),
    completion,
  );
  assert.throws(() =>
    completeMediaAssetRequestSchema.parse({
      lessonId: 7,
      languageCode: "th",
      extra: true,
    }),
  );
  assert.throws(() =>
    completeMediaAssetResponseSchema.parse({
      ...completion,
      mediaAsset: { ...completion.mediaAsset, objectKey: "audio/private.mp3" },
    }),
  );
});

test("Published Lesson audio stays private until the mobile projection", () => {
  const detail = {
    id: 1,
    chapter: 1,
    version: 1,
    status: "PUBLISHED" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    availableLanguageCodes: ["th"],
    lessonTexts: [{ languageCode: "th", title: "ไทย", content: "เนื้อหา" }],
    lessonSources: [],
  };
  const currentAudio = {
    mediaAssetId: 2,
    audioVersion: 1,
    objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
    contentType: "audio/mpeg" as const,
    sizeBytes: 1,
    durationMs: null,
  };

  assert.deepEqual(
    publishedLessonDetailSchema.parse({ ...detail, currentAudio }),
    { ...detail, currentAudio },
  );
  assert.throws(() =>
    mobileLessonDetailSchema.parse({
      id: 1,
      chapter: 1,
      version: 1,
      languageCode: "th",
      title: "ไทย",
      content: "เนื้อหา",
      availableLanguageCodes: ["th"],
      lessonSources: [],
      audio: { ...currentAudio, playbackUrl: "https://storage.example/play" },
    }),
  );
  assert.deepEqual(
    mobileLessonDetailSchema.parse({
      id: 1,
      chapter: 1,
      version: 1,
      languageCode: "th",
      title: "ไทย",
      content: "เนื้อหา",
      availableLanguageCodes: ["th"],
      lessonSources: [],
      audio: {
        mediaAssetId: 2,
        audioVersion: 1,
        contentType: "audio/mpeg",
        sizeBytes: 1,
        durationMs: null,
        playbackUrl: "https://storage.example/play",
        playbackExpiresAt: "2026-01-01T01:00:00.000Z",
      },
    }),
    {
      id: 1,
      chapter: 1,
      version: 1,
      languageCode: "th",
      title: "ไทย",
      content: "เนื้อหา",
      availableLanguageCodes: ["th"],
      lessonSources: [],
      audio: {
        mediaAssetId: 2,
        audioVersion: 1,
        contentType: "audio/mpeg",
        sizeBytes: 1,
        durationMs: null,
        playbackUrl: "https://storage.example/play",
        playbackExpiresAt: "2026-01-01T01:00:00.000Z",
      },
    },
  );
});

test("Lesson transport contracts are strict and keep database fields private", () => {
  assert.deepEqual(
    createLessonRequestSchema.parse({ chapter: 1, version: 2 }),
    {
      chapter: 1,
      version: 2,
    },
  );
  assert.throws(() =>
    createLessonRequestSchema.parse({
      chapter: 1,
      version: 2,
      status: "DRAFT",
    }),
  );
  assert.throws(() =>
    createLessonRequestSchema.parse({ chapter: 0, version: 1 }),
  );
  assert.throws(() =>
    lessonDetailSchema.parse({
      id: 1,
      chapter: 1,
      version: 1,
      status: "DRAFT",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      availableLanguageCodes: [],
      lessonTexts: [],
      lessonSources: [],
      databaseRow: true,
    }),
  );
});

test("Lesson Text upserts require non-blank strict content", () => {
  assert.deepEqual(
    upsertLessonTextRequestSchema.parse({ title: "Titel", content: "Indhold" }),
    { title: "Titel", content: "Indhold" },
  );
  assert.deepEqual(
    upsertLessonTextRequestSchema.parse({
      title: " Titel ",
      content: " Indhold ",
    }),
    { title: " Titel ", content: " Indhold " },
  );
  assert.throws(() =>
    upsertLessonTextRequestSchema.parse({ title: " ", content: "Indhold" }),
  );
  assert.throws(() =>
    upsertLessonTextRequestSchema.parse({
      title: "Titel",
      content: "",
      extra: true,
    }),
  );
});

test("Lesson patches are strict and non-empty", () => {
  assert.deepEqual(
    patchLessonRequestSchema.parse({ chapter: 2, status: "PUBLISHED" }),
    { chapter: 2, status: "PUBLISHED" },
  );
  assert.throws(() => patchLessonRequestSchema.parse({}));
  assert.throws(() => patchLessonRequestSchema.parse({ chapter: undefined }));
  assert.throws(() => patchLessonRequestSchema.parse({ chapter: 0 }));
  assert.throws(() =>
    patchLessonRequestSchema.parse({ status: "DRAFT", extra: true }),
  );
});

test("Source contracts accept only trimmed HTTP URLs and offset timestamps", () => {
  assert.deepEqual(
    createSourceRequestSchema.parse({
      url: " https://example.com/source ",
      publishedAt: "2026-01-01T02:00:00+02:00",
    }),
    {
      url: "https://example.com/source",
      publishedAt: "2026-01-01T02:00:00+02:00",
    },
  );
  assert.deepEqual(
    createSourceRequestSchema.parse({
      url: "http://example.com",
      publishedAt: null,
    }),
    { url: "http://example.com", publishedAt: null },
  );
  assert.throws(() =>
    createSourceRequestSchema.parse({
      url: "ftp://example.com",
      publishedAt: null,
    }),
  );
  assert.throws(() =>
    createSourceRequestSchema.parse({ url: "/source", publishedAt: null }),
  );
  assert.throws(() =>
    createSourceRequestSchema.parse({
      url: "https://example.com",
      publishedAt: "2026-01-01T00:00:00",
    }),
  );
  assert.throws(() =>
    createSourceRequestSchema.parse({
      url: "https://example.com",
      publishedAt: null,
      extra: true,
    }),
  );
});

test("Lesson Source upserts allow absent locators but reject invalid pages", () => {
  assert.deepEqual(upsertLessonSourceRequestSchema.parse({}), {});
  assert.deepEqual(
    upsertLessonSourceRequestSchema.parse({
      pageFrom: 2,
      pageTo: 3,
      sectionReference: null,
    }),
    { pageFrom: 2, pageTo: 3, sectionReference: null },
  );
  assert.throws(() => upsertLessonSourceRequestSchema.parse({ pageFrom: 0 }));
  assert.throws(() =>
    upsertLessonSourceRequestSchema.parse({ pageFrom: 4, pageTo: 3 }),
  );
  assert.throws(() =>
    upsertLessonSourceRequestSchema.parse({ pageFrom: null, extra: true }),
  );
});
