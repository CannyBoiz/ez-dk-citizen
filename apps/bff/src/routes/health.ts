import {
  livenessResponseSchema,
  readinessResponseSchema,
  type RequestIdEnvironment,
} from "@ez-dk-citizen/api-contracts";
import type { Hono } from "hono";

export function registerHealthRoutes(
  app: Hono<RequestIdEnvironment>,
  checkDataServiceReadiness: () => Promise<void>,
) {
  app.get("/health", (c) =>
    c.json(livenessResponseSchema.parse({ status: "ok" })),
  );
  app.get("/ready", async (c) => {
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
