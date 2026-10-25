import { timingSafeEqual } from "node:crypto";
import type { Context, Next } from "hono";

import { problem } from "../errors/problem-details.js";
import type { RequestIdEnvironment } from "./request-id.js";

export function adminAuth(token: string | undefined) {
  return async (c: Context<RequestIdEnvironment>, next: Next) => {
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

function secureEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return (
    leftBytes.length === rightBytes.length &&
    timingSafeEqual(leftBytes, rightBytes)
  );
}
