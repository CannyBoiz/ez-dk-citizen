import type { Context, Next } from "hono";

import type { RequestIdEnvironment } from "./request-id.js";

export async function logging(
  c: Context<RequestIdEnvironment>,
  next: Next,
): Promise<void> {
  const startedAt = performance.now();
  try {
    await next();
  } finally {
    console.log(
      JSON.stringify({
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.routePath || c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      }),
    );
  }
}
