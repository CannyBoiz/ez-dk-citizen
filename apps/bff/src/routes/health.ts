import {
  livenessResponseSchema,
  readinessResponseSchema,
  type RequestIdEnvironment,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

export function createHealthRoutes(
  checkDataServiceReadiness: () => Promise<void>,
) {
  return new Hono<RequestIdEnvironment>()
    .get("/health", (c) =>
      c.json(livenessResponseSchema.parse({ status: "ok" })),
    )
    .get("/ready", async (c) => {
      try {
        await checkDataServiceReadiness();
        return c.json(readinessResponseSchema.parse({ status: "ok" }));
      } catch {
        return c.json(
          readinessResponseSchema.parse({ status: "unavailable" }),
          503,
        );
      }
    });
}
