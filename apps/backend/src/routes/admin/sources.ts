import {
  createSourceRequestSchema,
  sourceIdParamsSchema,
  updateSourceRequestSchema,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import { refuse } from "../../errors/problem-details.js";
import type { RequestIdEnvironment } from "../../middleware/request-id.js";
import { validateJson, validateRequest } from "../../middleware/validation.js";

export function createAdminSourceRoutes(data: DataModule) {
  return new Hono<RequestIdEnvironment>()
    .post("/", validateJson(createSourceRequestSchema), async (c) => {
      const created = await data.createSource(c.req.valid("json"));
      if (typeof created === "string") {
        return refuse(c, created);
      }
      c.header("Location", `/api/admin/sources/${created.id}`);
      return c.json(created, 201);
    })
    .patch(
      "/:sourceId",
      validateRequest("param", sourceIdParamsSchema),
      validateJson(updateSourceRequestSchema),
      async (c) => {
        const { sourceId } = c.req.valid("param");
        const updated = await data.updateSource(sourceId, c.req.valid("json"));
        if (typeof updated === "string") {
          return refuse(c, updated);
        }
        return c.json(updated);
      },
    )
    .get("/", async (c) => c.json(await data.listSources()));
}
