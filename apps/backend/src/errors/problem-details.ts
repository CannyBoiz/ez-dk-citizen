import {
  problem,
  type RequestIdEnvironment,
} from "@ez-dk-citizen/api-contracts";
import { isDatabaseUnavailable } from "@ez-dk-citizen/data";
import type { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

export { problem };

// Answers each outcome code in `refusals` with its status and detail.
export function refuseWith<
  const Refusals extends Record<
    string,
    readonly [Parameters<typeof problem>[1], string]
  >,
>(refusals: Refusals) {
  return (
    c: Parameters<typeof problem>[0],
    outcome: keyof Refusals & string,
  ) => {
    const [status, detail] = refusals[outcome];
    return problem(c, status, outcome, detail);
  };
}

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
