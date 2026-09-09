import {
  livenessResponseSchema,
  readinessResponseSchema,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

export function createDataApp(checkDatabaseReadiness: () => Promise<void>) {
  const app = new Hono();

  app.get("/", (c) => c.text("Hello Hono!"));
  app.get("/health", (c) =>
    c.json(livenessResponseSchema.parse({ status: "ok" })),
  );
  app.get("/ready", async (c) => {
    try {
      await checkDatabaseReadiness();
      return c.json(readinessResponseSchema.parse({ status: "ok" }));
    } catch {
      return c.json(
        readinessResponseSchema.parse({ status: "unavailable" }),
        503,
      );
    }
  });

  return app;
}
