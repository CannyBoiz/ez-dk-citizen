import {
  livenessResponseSchema,
  type RequestIdEnvironment,
  readinessResponseSchema,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

export function createHealthRoutes(checkReadiness: () => Promise<void>) {
  return new Hono<RequestIdEnvironment>()
    .get("/health", (c) =>
      c.json(livenessResponseSchema.parse({ status: "ok" })),
    )
    .get("/ready", async (c) => {
      try {
        await checkReadiness();
        return c.json(readinessResponseSchema.parse({ status: "ok" }));
      } catch {
        return c.json(
          readinessResponseSchema.parse({ status: "unavailable" }),
          503,
        );
      }
    });
}
