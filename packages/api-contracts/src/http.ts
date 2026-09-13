import { sValidator } from "@hono/standard-validator";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Input, MiddlewareHandler } from "hono";
import type { ZodType } from "zod";

import { problemDetailsSchema } from "./index.js";

export type RequestIdEnvironment = {
  Variables: { requestId: string };
};

type HttpContext = {
  req: {
    header(name: string): string | undefined;
    method: string;
    path: string;
    routePath?: string;
    text(): Promise<string>;
  };
  res: { status: number };
  set(name: "requestId", value: string): void;
  get(name: "requestId"): string;
  header(name: string, value: string): void;
  body(
    body: string | null,
    status?: number,
    headers?: Record<string, string>,
  ): Response;
};

type HttpApp = {
  use(
    path: string,
    handler: (
      context: HttpContext,
      next: () => Promise<void>,
    ) => Promise<void | Response>,
  ): unknown;
};

const problemTitles: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
  409: "Conflict",
  422: "Unprocessable Content",
  500: "Internal Server Error",
  502: "Bad Gateway",
  504: "Gateway Timeout",
};

export function installRequestLifecycle(app: HttpApp): void {
  app.use("*", async (context, next) => {
    const supplied = context.req.header("X-Request-ID");
    const requestId =
      supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(supplied)
        ? supplied
        : randomUUID();

    context.set("requestId", requestId);
    context.header("X-Request-ID", requestId);
    const startedAt = performance.now();
    try {
      await next();
    } finally {
      console.log(
        JSON.stringify({
          requestId,
          method: context.req.method,
          path: context.req.routePath || context.req.path,
          status: context.res.status,
          durationMs: Math.round(performance.now() - startedAt),
        }),
      );
    }
  });
}

export function requireBearerToken(token: string | undefined) {
  return async (context: HttpContext, next: () => Promise<void>) => {
    const authorization = context.req.header("Authorization");
    const supplied = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;

    if (!token || !supplied || !secureEqual(supplied, token)) {
      context.header("WWW-Authenticate", "Bearer");
      return problem(
        context,
        401,
        "authentication_required",
        "Authentication is required.",
      );
    }

    await next();
  };
}

export function problem(
  context: HttpContext,
  status: 400 | 401 | 404 | 409 | 422 | 500 | 502 | 504,
  code: string,
  detail: string,
  errors?: Array<{ path: Array<string | number>; message: string }>,
) {
  const body = problemDetailsSchema.parse({
    type: `https://ez-dk-citizen.invalid/problems/${code}`,
    title: problemTitles[status],
    status,
    detail,
    instance: context.req.path,
    code,
    requestId: context.get("requestId"),
    ...(errors ? { errors } : {}),
  });

  return context.body(JSON.stringify(body), status, {
    "Content-Type": "application/problem+json",
  });
}

export function validateRequest<Schema extends ZodType>(
  target: "json" | "param" | "query",
  schema: Schema,
): MiddlewareHandler<
  any,
  string,
  { out: { json?: unknown; param?: unknown; query?: unknown } } & Input
> {
  return sValidator(target, schema, (result, context) => {
    const contentType = context.req
      .header("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (target === "json" && contentType !== "application/json") {
      return problem(context, 422, "invalid_content_type", "JSON is required.");
    }
    if (!result.success) {
      return problem(
        context,
        422,
        "validation_failed",
        "Request body failed validation.",
        result.error.map((issue) => ({
          path: (issue.path ?? [])
            .map((segment) =>
              typeof segment === "object" && segment ? segment.key : segment,
            )
            .filter(
              (segment): segment is string | number =>
                typeof segment === "string" || typeof segment === "number",
            ),
          message: issue.message,
        })),
      );
    }
  }) as unknown as MiddlewareHandler<
    any,
    string,
    { out: { json?: unknown; param?: unknown; query?: unknown } }
  >;
}

export function validateJson<Schema extends ZodType>(schema: Schema) {
  return validateRequest("json", schema);
}

function secureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
