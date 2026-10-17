import {
  type CreateSourceRequest,
  createSourceRequestSchema,
  type RequestIdEnvironment,
  sourceIdParamsSchema,
  type UpdateSourceRequest,
  updateSourceRequestSchema,
  validateJson,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import { problem } from "../../errors/problem-details.js";

export function createAdminSourceRoutes(data: DataModule) {
  return new Hono<RequestIdEnvironment>()
    .post("/", validateJson(createSourceRequestSchema), async (c) => {
      const created = await data.createSource(
        c.req.valid("json") as CreateSourceRequest,
      );
      if (created === "source_url_conflict") {
        return problem(
          c,
          409,
          created,
          "A Source with this URL already exists.",
        );
      }
      c.header("Location", `/api/admin/sources/${created.id}`);
      return c.json(created, 201);
    })
    .patch(
      "/:sourceId",
      validateRequest("param", sourceIdParamsSchema),
      validateJson(updateSourceRequestSchema),
      async (c) => {
        const { sourceId } = c.req.valid("param") as { sourceId: number };
        const updated = await data.updateSource(
          sourceId,
          c.req.valid("json") as UpdateSourceRequest,
        );
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
    )
    .get("/", async (c) => c.json(await data.listSources()));
}
