import {
  type CreateSourceRequest,
  createSourceRequestSchema,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import { validateJson } from "./validation.js";

// Checked by `tsc --noEmit`, not by a test runner: a wrong type fails to compile.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

function assertType<_ extends true>() {}

// validateJson must pass the schema's output type through, so handlers need no casts.
new Hono().post("/", validateJson(createSourceRequestSchema), (c) => {
  const body = c.req.valid("json");
  assertType<Equal<typeof body, CreateSourceRequest>>();
  return c.body(null);
});
