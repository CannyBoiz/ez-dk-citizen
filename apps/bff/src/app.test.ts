import {
  livenessResponseSchema,
  readinessResponseSchema,
} from "@ez-dk-citizen/api-contracts";
import assert from "node:assert/strict";
import { test } from "node:test";

import { createBffApp } from "./app.js";

test("BFF health is independent of the Data Service", async () => {
  let checks = 0;
  const app = createBffApp(async () => {
    checks += 1;
  });

  const response = await app.request("/health");

  assert.equal(response.status, 200);
  livenessResponseSchema.parse(await response.json());
  assert.equal(checks, 0);
});

test("BFF readiness reflects the Data Service", async (context) => {
  await context.test("ready", async () => {
    const app = createBffApp(async () => undefined);
    const response = await app.request("/ready");

    assert.equal(response.status, 200);
    assert.deepEqual(readinessResponseSchema.parse(await response.json()), {
      status: "ok",
    });
  });

  await context.test("unavailable", async () => {
    const app = createBffApp(async () => {
      throw new Error("Data Service is unavailable");
    });
    const response = await app.request("/ready");

    assert.equal(response.status, 503);
    assert.deepEqual(readinessResponseSchema.parse(await response.json()), {
      status: "unavailable",
    });
  });
});
