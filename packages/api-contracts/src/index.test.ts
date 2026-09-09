import assert from "node:assert/strict";
import { test } from "node:test";

import { livenessResponseSchema, readinessResponseSchema } from "./index.js";

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
