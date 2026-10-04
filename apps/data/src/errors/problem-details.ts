import {
  problem,
  type RequestIdEnvironment,
} from "@ez-dk-citizen/api-contracts";
import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

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
