import {
  problem,
  type RequestIdEnvironment,
} from "@ez-dk-citizen/api-contracts";
import { isDatabaseUnavailable } from "@ez-dk-citizen/data";
import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

export { problem };

export function installProblemDetails(app: Hono<RequestIdEnvironment>) {
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 400) {
      return problem(
        c,
        400,
        "malformed_json",
        "Request body is not valid JSON.",
      );
    }
    if (isDatabaseUnavailable(error)) {
      return problem(
        c,
        503,
        "database_unavailable",
        "The database is unavailable.",
      );
    }
    return problem(
      c,
      500,
      "internal_error",
      "The request could not be completed.",
    );
  });
  app.notFound((c) =>
    problem(c, 404, "not_found", "The requested resource was not found."),
  );
}
