import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSourceRequestSchema,
  createLessonRequestSchema,
  lessonDetailSchema,
  livenessResponseSchema,
  readinessResponseSchema,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
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
  assert.throws(() =>
    upsertLessonSourceRequestSchema.parse({ pageFrom: 0 }),
  );
  assert.throws(() =>
    upsertLessonSourceRequestSchema.parse({ pageFrom: 4, pageTo: 3 }),
  );
  assert.throws(() =>
    upsertLessonSourceRequestSchema.parse({ pageFrom: null, extra: true }),
  );
});
