import {
  livenessResponseSchema,
  problemDetailsSchema,
  readinessResponseSchema,
} from "@ez-dk-citizen/api-contracts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createDataApp } from "./app.js";

test("Data Service health is independent of PostgreSQL", async () => {
  let checks = 0;
  const app = createDataApp(async () => {
    checks += 1;
  });

  const response = await app.request("/health");

  assert.equal(response.status, 200);
  livenessResponseSchema.parse(await response.json());
  assert.equal(checks, 0);
});

test("Data Service readiness reflects PostgreSQL", async (context) => {
  await context.test("ready", async () => {
    const app = createDataApp(async () => undefined);
    const response = await app.request("/ready");

    assert.equal(response.status, 200);
    assert.deepEqual(readinessResponseSchema.parse(await response.json()), {
      status: "ok",
    });
  });

  await context.test("unavailable", async () => {
    const app = createDataApp(async () => {
      throw new Error("PostgreSQL is unavailable");
    });
    const response = await app.request("/ready");

    assert.equal(response.status, 503);
    assert.deepEqual(readinessResponseSchema.parse(await response.json()), {
      status: "unavailable",
    });
  });
});

test("Data Service unmatched routes return Problem Details", async () => {
  const app = createDataApp(async () => undefined);

  const response = await app.request("/missing");

  assert.equal(response.status, 404);
  assert.equal(
    response.headers.get("content-type"),
    "application/problem+json",
  );
  assert.equal((await response.json()).code, "not_found");
});

test("Data Service rejects write bodies above 1 MiB with Problem Details", async () => {
  const app = createDataApp(async () => undefined, {
    dataServiceToken: "data-token",
  });
  const response = await app.request("/internal/lessons", {
    method: "POST",
    headers: {
      Authorization: "Bearer data-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chapter: 1,
      version: 1,
      padding: "x".repeat(1024 * 1024),
    }),
  });

  assert.equal(response.status, 422);
  assert.equal(
    problemDetailsSchema.parse(await response.json()).code,
    "body_too_large",
  );
});

const internalRequests = [
  { method: "GET", path: "/internal/lessons" },
  { method: "GET", path: "/internal/lessons/1?language=th&status=PUBLISHED" },
  {
    method: "POST",
    path: "/internal/lessons",
    body: { chapter: 1, version: 1 },
  },
  {
    method: "PATCH",
    path: "/internal/lessons/1",
    body: { status: "ARCHIVED" },
  },
  {
    method: "PUT",
    path: "/internal/lessons/1/texts/th",
    body: { title: "Thai", content: "Lesson content" },
  },
  { method: "PUT", path: "/internal/lessons/1/sources/1", body: {} },
  { method: "DELETE", path: "/internal/lessons/1/sources/1" },
  { method: "GET", path: "/internal/sources" },
  {
    method: "POST",
    path: "/internal/sources",
    body: { url: "https://example.test/source", publishedAt: null },
  },
  {
    method: "POST",
    path: "/internal/media-assets",
    body: {
      languageCode: "th",
      storageProvider: "s3",
      storageContainer: "citizenship-audio",
      objectKey: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
      originalFilename: "lesson.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1024,
    },
  },
  { method: "GET", path: "/internal/media-assets/1" },
  { method: "POST", path: "/internal/media-assets/1/fail" },
  {
    method: "POST",
    path: "/internal/media-assets/1/complete",
    body: { lessonId: 1, languageCode: "th" },
  },
];

test("Data Service authenticates all internal routes before parsing bodies", async (context) => {
  const app = createDataApp(async () => undefined, {
    dataServiceToken: "data-token",
  });

  for (const { method, path } of internalRequests) {
    await context.test(`${method} ${path}`, async () => {
      const response = await app.request(path, {
        method,
        headers: {
          Authorization: "Bearer wrong-token",
          "Content-Type": "application/json",
          "X-Request-ID": "authentication-test",
        },
        ...(method === "GET" ? {} : { body: "{" }),
      });

      assert.equal(response.status, 401);
      assert.equal(response.headers.get("WWW-Authenticate"), "Bearer");
      assert.equal(response.headers.get("X-Request-ID"), "authentication-test");
      const body = problemDetailsSchema.parse(await response.json());
      assert.equal(body.code, "authentication_required");
      assert.equal(body.requestId, "authentication-test");
    });
  }
});

test("Data Service reports a missing database for every valid internal operation", async (context) => {
  const app = createDataApp(async () => undefined, {
    dataServiceToken: "data-token",
  });

  for (const { method, path, body } of internalRequests) {
    await context.test(`${method} ${path}`, async () => {
      const response = await app.request(path, {
        method,
        headers: {
          Authorization: "Bearer data-token",
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

      assert.equal(response.status, 500);
      const result = problemDetailsSchema.parse(await response.json());
      assert.equal(result.code, "internal_error");
      assert.equal(result.requestId, response.headers.get("X-Request-ID"));
    });
  }
});

test("Data Service applies validation, JSON errors, and body limits across feature routers", async (context) => {
  const app = createDataApp(async () => undefined, {
    dataServiceToken: "data-token",
  });
  const writes = internalRequests.filter(
    (request) => request.body !== undefined,
  );

  for (const { method, path } of writes) {
    await context.test(`${method} ${path}`, async () => {
      for (const [body, status, code] of [
        ["{", 400, "malformed_json"],
        [JSON.stringify({ unexpected: true }), 422, "validation_failed"],
        [
          JSON.stringify({ padding: "x".repeat(1024 * 1024) }),
          422,
          "body_too_large",
        ],
      ] as const) {
        const response = await app.request(path, {
          method,
          headers: {
            Authorization: "Bearer data-token",
            "Content-Type": "application/json",
            "X-Request-ID": "validation-test",
          },
          body,
        });

        assert.equal(response.status, status);
        assert.equal(
          response.headers.get("content-type"),
          "application/problem+json",
        );
        const result = problemDetailsSchema.parse(await response.json());
        assert.equal(result.code, code);
        assert.equal(result.requestId, "validation-test");
      }
    });
  }
});
