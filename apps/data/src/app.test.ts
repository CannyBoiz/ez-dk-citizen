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
