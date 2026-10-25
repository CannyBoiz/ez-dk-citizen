import { randomUUID } from "node:crypto";
import type { Context, Next } from "hono";

export type RequestIdEnvironment = {
  Variables: { requestId: string };
};

export async function requestId(
  c: Context<RequestIdEnvironment>,
  next: Next,
): Promise<void> {
  const supplied = c.req.header("X-Request-ID");
  const id =
    supplied && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(supplied)
      ? supplied
      : randomUUID();

  c.set("requestId", id);
  c.header("X-Request-ID", id);
  await next();
}
