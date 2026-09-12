import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createLessonRequestSchema,
  lessonDetailSchema,
  livenessResponseSchema,
  readinessResponseSchema,
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
