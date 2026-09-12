import { randomUUID, timingSafeEqual } from "node:crypto";

import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Context, Hono } from "hono";

import { problemDetailsSchema } from "@ez-dk-citizen/api-contracts";

export type DataAppEnvironment = {
  Variables: { requestId: string };
};

type DataContext = Context<DataAppEnvironment>;
type Schema<T> = {
  safeParse(input: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: Array<{ path: PropertyKey[]; message: string }> };
      };
};

const problemTitles: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Content",
  500: "Internal Server Error",
};

export function installRequestLifecycle(app: Hono<DataAppEnvironment>): void {
  app.use("*", async (c, next) => {
    const supplied = c.req.header("X-Request-ID");
    const requestId =
      supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(supplied)
        ? supplied
        : randomUUID();

    c.set("requestId", requestId);
    c.header("X-Request-ID", requestId);

    const startedAt = performance.now();
    try {
      await next();
    } finally {
      console.log(
        JSON.stringify({
          requestId,
          method: c.req.method,
          path: c.req.routePath || c.req.path,
          status: c.res.status,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
    }
  });
}

export function requireBearerToken(token: string | undefined) {
  return async (c: DataContext, next: () => Promise<void>) => {
    const authorization = c.req.header("Authorization");
    const supplied = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;

    if (!token || !supplied || !secureEqual(supplied, token)) {
      c.header("WWW-Authenticate", "Bearer");
      return problem(
        c,
        401,
        "authentication_required",
        "Authentication is required.",
      );
    }

    await next();
  };
}

export function problem(
  c: DataContext,
  status: 400 | 401 | 404 | 409 | 422 | 500,
  code: string,
  detail: string,
  errors?: Array<{ path: Array<string | number>; message: string }>,
) {
  const body = problemDetailsSchema.parse({
    type: `https://ez-dk-citizen.invalid/problems/${code}`,
    title: problemTitles[status],
    status,
    detail,
    instance: c.req.path,
    code,
    requestId: c.get("requestId"),
    ...(errors ? { errors } : {}),
  });

  return c.body(JSON.stringify(body), status as ContentfulStatusCode, {
    "Content-Type": "application/problem+json",
  });
}

export async function parseJsonBody<T>(
  c: DataContext,
  schema: Schema<T>,
): Promise<{ value: T } | { response: Response }> {
  const contentType = c.req.header("Content-Type")?.split(";", 1)[0].trim();
  if (contentType?.toLowerCase() !== "application/json") {
    return {
      response: problem(c, 422, "invalid_content_type", "JSON is required."),
    };
  }

  const raw = await c.req.text();
  if (new TextEncoder().encode(raw).byteLength > 1024 * 1024) {
    return {
      response: problem(
        c,
        422,
        "body_too_large",
        "Request body exceeds 1 MiB.",
      ),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      response: problem(
        c,
        400,
        "malformed_json",
        "Request body is not valid JSON.",
      ),
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      response: problem(
        c,
        422,
        "validation_failed",
        "Request body failed validation.",
        result.error.issues.map((issue) => ({
          path: issue.path.filter(
            (segment): segment is string | number =>
              typeof segment === "string" || typeof segment === "number",
          ),
          message: issue.message,
        })),
      ),
    };
  }

  return { value: result.data };
}

export function parsePositiveId(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function isPostgresError(error: unknown, code: string): boolean {
  let candidate = error;
  while (candidate && typeof candidate === "object") {
    if ("code" in candidate && candidate.code === code) return true;
    candidate = "cause" in candidate ? candidate.cause : undefined;
  }
  return false;
}

function secureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
