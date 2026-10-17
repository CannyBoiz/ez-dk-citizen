import {
  type CreateSourceRequest,
  createSourceRequestSchema,
  problem,
  type RequestIdEnvironment,
  sourceIdParamsSchema,
  type UpdateSourceRequest,
  updateSourceRequestSchema,
  validateJson,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { DataOperations } from "../../data-operations.js";

export function createSourceRoutes(data: DataOperations) {
  const app = new Hono<RequestIdEnvironment>();

  app.post("/", validateJson(createSourceRequestSchema), async (c) => {
    const input = c.req.valid("json") as CreateSourceRequest;
    const created = await data.createSource(input);
    if (created === "source_url_conflict") {
      return problem(c, 409, created, "A Source with this URL already exists.");
    }
    return c.json(created, 201);
  });

  app.patch(
    "/:sourceId",
    validateRequest("param", sourceIdParamsSchema),
    validateJson(updateSourceRequestSchema),
    async (c) => {
      const { sourceId } = c.req.valid("param") as { sourceId: number };
      const input = c.req.valid("json") as UpdateSourceRequest;
      const updated = await data.updateSource(sourceId, input);
      if (updated === "source_not_found") {
        return problem(c, 404, updated, "Source was not found.");
      }
      if (updated === "source_url_conflict") {
        return problem(
          c,
          409,
          updated,
          "A Source with this URL already exists.",
        );
      }
      return c.json(updated);
    },
  );

  app.get("/", async (c) => c.json(await data.listSources()));

  return app;
}
