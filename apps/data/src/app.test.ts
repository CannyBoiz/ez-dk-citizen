import {
  livenessResponseSchema,
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
