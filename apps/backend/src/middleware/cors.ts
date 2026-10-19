import { cors } from "hono/cors";

export function adminCors(origins: string[] = []) {
  return cors({
    origin: (origin) =>
      origin && origins.includes(origin) ? origin : undefined,
    allowMethods: ["DELETE", "GET", "PATCH", "POST", "PUT", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type", "X-Request-ID"],
    credentials: false,
  });
}
