import assert from "node:assert/strict";
import { test } from "node:test";
import { problemDetailsSchema } from "@ez-dk-citizen/api-contracts";

import { createApp, createBffApp } from "./app.js";
import { readBffConfig } from "./config.js";
import { createTestDataServiceClient } from "./testing/data-service-client.js";

test("BFF composition root uses runtime configuration and the supplied client", async (context) => {
  const config = readBffConfig({
    DATA_SERVICE_URL: "http://data.example",
    ADMIN_API_TOKEN: "configured-admin-token",
    DATA_SERVICE_TOKEN: "configured-data-token",
    AWS_REGION: "eu-north-1",
    S3_BUCKET: "test-bucket",
    ADMIN_ORIGINS: "https://admin.example",
  });
  let ready = true;
  const fetchReadiness: typeof fetch = async (input, init) => {
    assert.equal(input.toString(), "http://data.example/ready");
    assert.ok(init?.signal instanceof AbortSignal);
    return Response.json(
      { status: ready ? "ok" : "unavailable" },
      { status: ready ? 200 : 503 },
    );
  };
  const readiness = context.mock.method(globalThis, "fetch", fetchReadiness);
  const app = createApp({
    config,
    dataClient: createTestDataServiceClient({
      async listLessons(requestId) {
        assert.equal(requestId, "composition-request");
        return { items: [] };
      },
    }),
  });

  assert.equal((await app.request("/health")).status, 200);
  assert.equal(readiness.mock.callCount(), 0);
  const lessons = await app.request("/api/admin/lessons", {
    headers: {
      Authorization: "Bearer configured-admin-token",
      Origin: "https://admin.example",
      "X-Request-ID": "composition-request",
    },
  });
  assert.equal(lessons.status, 200);
  assert.deepEqual(await lessons.json(), { items: [] });
  assert.equal(
    lessons.headers.get("access-control-allow-origin"),
    "https://admin.example",
  );
  assert.equal((await app.request("/ready")).status, 200);
  ready = false;
  assert.equal((await app.request("/ready")).status, 503);
  assert.equal(readiness.mock.callCount(), 2);
});

test("BFF logs each response once with its validated or generated request ID", async (context) => {
  const log = context.mock.method(console, "log", () => undefined);
  const app = createBffApp(async () => undefined);
  for (const supplied of ["valid-request_1:2", "invalid request", undefined]) {
    const response = await app.request("/health", {
      headers: supplied ? { "X-Request-ID": supplied } : {},
    });
    const requestId = response.headers.get("x-request-id");
    assert.ok(requestId);
    if (supplied === "valid-request_1:2") assert.equal(requestId, supplied);
    else assert.match(requestId, /^[0-9a-f-]{36}$/);
    const event = JSON.parse(String(log.mock.calls.at(-1)?.arguments[0]));
    assert.deepEqual(Object.keys(event).sort(), [
      "durationMs",
      "method",
      "path",
      "requestId",
      "status",
    ]);
    assert.equal(event.requestId, requestId);
    assert.equal(event.status, 200);
    assert.equal(event.method, "GET");
    assert.equal(event.path, "/health");
    assert.equal(typeof event.durationMs, "number");
  }
  const missing = await app.request("/missing", {
    headers: { "X-Request-ID": "missing-request" },
  });
  assert.equal(missing.status, 404);
  const event = JSON.parse(String(log.mock.calls.at(-1)?.arguments[0]));
  assert.equal(event.requestId, "missing-request");
  assert.equal(event.status, 404);
  assert.equal(log.mock.callCount(), 4);
});

test("BFF authenticates every admin route group before reading its body", async () => {
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    adminOrigins: ["https://admin.example"],
  });

  for (const path of [
    "/api/admin/lessons",
    "/api/admin/sources",
    "/api/admin/media/upload-intents",
  ]) {
    const response = await app.request(path, {
      method: "POST",
      headers: {
        Origin: "https://admin.example",
        "Content-Type": "application/json",
        "X-Request-ID": "unauthorized-request",
      },
      body: "x".repeat(1024 * 1024 + 1),
    });

    assert.equal(response.status, 401);
    assert.equal(response.headers.get("www-authenticate"), "Bearer");
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      "https://admin.example",
    );
    assert.equal(response.headers.get("x-request-id"), "unauthorized-request");
    const failure = problemDetailsSchema.parse(await response.json());
    assert.equal(failure.code, "authentication_required");
    assert.equal(failure.requestId, "unauthorized-request");
    assert.equal(failure.instance, path);
  }
});

test("BFF handles admin preflight before authentication with explicit origins", async () => {
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
    adminOrigins: ["https://admin.example"],
  });

  for (const path of [
    "/api/admin/lessons",
    "/api/admin/sources",
    "/api/admin/media/upload-intents",
  ]) {
    for (const origin of ["https://admin.example", "https://other.example"]) {
      const response = await app.request(path, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Authorization,Content-Type",
          "X-Request-ID": "preflight-request",
        },
      });

      assert.equal(response.status, 204);
      assert.equal(
        response.headers.get("access-control-allow-origin"),
        origin === "https://admin.example" ? origin : null,
      );
      assert.equal(
        response.headers.get("access-control-allow-credentials"),
        null,
      );
      assert.equal(response.headers.get("www-authenticate"), null);
      assert.equal(response.headers.get("x-request-id"), "preflight-request");
    }
  }
});

test("BFF rejects write bodies above 1 MiB with Problem Details", async () => {
  const app = createBffApp(async () => undefined, {
    adminApiToken: "admin-token",
  });
  const response = await app.request("/api/admin/lessons", {
    method: "POST",
    headers: {
      Authorization: "Bearer admin-token",
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

test("BFF unmatched routes return Problem Details", async () => {
  const app = createBffApp(async () => undefined);

  const response = await app.request("/missing");

  assert.equal(response.status, 404);
  assert.equal(
    response.headers.get("content-type"),
    "application/problem+json",
  );
  assert.equal((await response.json()).code, "not_found");
});
