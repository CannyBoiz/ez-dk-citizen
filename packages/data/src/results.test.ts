import assert from "node:assert/strict";
import { test } from "node:test";

import {
  currentLessonAudioResultSchema,
  publishedLessonDetailSchema,
} from "./results.js";

const audio = {
  mediaAssetId: 2,
  audioVersion: 1,
  objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
  contentType: "audio/mpeg" as const,
  sizeBytes: 1,
  durationMs: null,
};

test("a Published Lesson carries its current audio's storage identity to the Backend", () => {
  const detail = {
    id: 1,
    chapter: 1,
    version: 1,
    versionPatch: 0,
    status: "PUBLISHED" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    availableLanguageCodes: ["th"],
    lessonTexts: [{ languageCode: "th", title: "ไทย", content: "เนื้อหา" }],
    lessonSources: [],
  };

  assert.deepEqual(
    publishedLessonDetailSchema.parse({ ...detail, currentAudio: audio }),
    { ...detail, currentAudio: audio },
  );
});

test("current Lesson Audio may be absent and carries nothing beyond its object key", () => {
  const current = {
    ...audio,
    audioVersion: 3,
    originalFilename: "chapter-1-th.mp3",
  };

  assert.deepEqual(currentLessonAudioResultSchema.parse({ audio: current }), {
    audio: current,
  });
  assert.deepEqual(currentLessonAudioResultSchema.parse({ audio: null }), {
    audio: null,
  });
  assert.throws(() =>
    currentLessonAudioResultSchema.parse({
      audio: { ...current, storageContainer: "bucket" },
    }),
  );
});
