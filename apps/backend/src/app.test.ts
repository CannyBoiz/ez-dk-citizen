import assert from "node:assert/strict";
import { once } from "node:events";
import { type AddressInfo, createServer, type Socket } from "node:net";
import { type TestContext, test } from "node:test";
import { problemDetailsSchema } from "@ez-dk-citizen/api-contracts";
import { createDataModule } from "@ez-dk-citizen/data";

import { createApp, createBackendApp } from "./app.js";
import { readBackendConfig } from "./config.js";
import { createTestDataModule } from "./testing/data-module.js";

test("Backend composition root uses runtime configuration and checks readiness against the configured database", async (context) => {
  const config = readBackendConfig({
    DATABASE_URL: await silentPostgres(context, false),
    DATABASE_TIMEOUT_MS: "100",
    ADMIN_API_TOKEN: "configured-admin-token",
    AWS_REGION: "eu-north-1",
    S3_BUCKET: "test-bucket",
    ADMIN_ORIGINS: "https://admin.example",
  });
  const { app, data } = createApp({ config });
  context.after(() => data.close());

  assert.equal((await app.request("/health")).status, 200);
  for (const path of [
    "/ready",
    "/api/admin/sources",
    "/api/admin/lessons",
    "/api/mobile/lessons",
  ]) {
    const started = performance.now();
    const response = await app.request(path, {
      headers: {
        Authorization: "Bearer configured-admin-token",
        Origin: "https://admin.example",
      },
    });
    assert.ok(performance.now() - started < 1_000, path);
    assert.equal(response.status, 503, path);
    assert.equal(
      response.headers.get("access-control-allow-origin"),
      path.startsWith("/api/admin/") ? "https://admin.example" : null,
    );
  }
});

test("Backend answers 503 database_unavailable within the timeout when PostgreSQL is unreachable or stops answering", async (context) => {
  const timeoutMs = 200;
  for (const databaseUrl of [
    "postgresql://user:password@127.0.0.1:1/database",
    await silentPostgres(context, false),
    await silentPostgres(context, true),
  ]) {
    const data = createDataModule(databaseUrl, timeoutMs);
    context.after(() => data.close());
    const app = createBackendApp(async () => undefined, {
      adminApiToken: "admin-token",
      data,
    });

    const started = performance.now();
    const response = await app.request("/api/admin/sources", {
      headers: { Authorization: "Bearer admin-token" },
    });

    // The timeout plus scheduling slack.
    assert.ok(performance.now() - started < timeoutMs + 200, databaseUrl);
    assert.equal(response.status, 503, databaseUrl);
    assert.equal(
      problemDetailsSchema.parse(await response.json()).code,
      "database_unavailable",
    );
  }
});

test("Backend reaches PostgreSQL only through the data module", async () => {
  for (const name of ["drizzle-orm", "pg"]) {
    await assert.rejects(import(name), { code: "ERR_MODULE_NOT_FOUND" }, name);
  }
});

test("Backend answers 500 when the data module fails for any other reason", async () => {
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
    data: createTestDataModule({
      async listSources() {
        throw new Error("A bug, not an outage.");
      },
    }),
  });

  const response = await app.request("/api/admin/sources", {
    headers: { Authorization: "Bearer admin-token" },
  });

  assert.equal(response.status, 500);
  assert.equal((await response.json()).code, "internal_error");
});

test("Backend logs each response once with its validated or generated request ID", async (context) => {
  const log = context.mock.method(console, "log", () => undefined);
  const app = createBackendApp(async () => undefined);
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

test("Backend authenticates every admin route group before reading its body", async () => {
  const app = createBackendApp(async () => undefined, {
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

test("Backend handles admin preflight before authentication with explicit origins", async () => {
  const app = createBackendApp(async () => undefined, {
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

test("Backend rejects write bodies above 1 MiB with Problem Details", async () => {
  const app = createBackendApp(async () => undefined, {
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
      padding: "x".repeat(1024 * 1024),
    }),
  });

  assert.equal(response.status, 422);
  assert.equal(
    problemDetailsSchema.parse(await response.json()).code,
    "body_too_large",
  );
});

test("Backend sets security headers on every response of both APIs", async () => {
  const app = createBackendApp(async () => undefined, {
    adminApiToken: "admin-token",
  });

  for (const [path, status] of [
    ["/health", 200],
    ["/api/admin/sources", 401],
    ["/missing", 404],
    ["/api/mobile/lessons", 500],
  ] as const) {
    const response = await app.request(path);

    assert.equal(response.status, status, path);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(
      response.headers.get("strict-transport-security"),
      "max-age=15552000; includeSubDomains",
    );
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("x-frame-options"), "SAMEORIGIN");
  }
});

test("Backend unmatched routes return Problem Details", async () => {
  const app = createBackendApp(async () => undefined);

  const response = await app.request("/missing");

  assert.equal(response.status, 404);
  assert.equal(
    response.headers.get("content-type"),
    "application/problem+json",
  );
  assert.equal((await response.json()).code, "not_found");
});

// A PostgreSQL stand-in that never answers. With `startup`, it first completes the
// startup handshake, like a server that stops answering a pooled connection.
async function silentPostgres(context: TestContext, startup: boolean) {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("error", () => undefined);
    if (startup) {
      // AuthenticationOk, then ReadyForQuery.
      socket.once("data", () =>
        socket.write(
          Buffer.from([0x52, 0, 0, 0, 8, 0, 0, 0, 0, 0x5a, 0, 0, 0, 5, 0x49]),
        ),
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => {
    for (const socket of sockets) socket.destroy();
    server.close();
  });
  const { port } = server.address() as AddressInfo;
  return `postgresql://user:password@127.0.0.1:${port}/database`;
}
