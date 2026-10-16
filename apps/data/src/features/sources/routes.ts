import {
  type CreateSourceRequest,
  createSourceRequestSchema,
  problem,
  type RequestIdEnvironment,
  sourceIdParamsSchema,
  sourceListResponseSchema,
  sourceResponseSchema,
  type UpdateSourceRequest,
  updateSourceRequestSchema,
  validateJson,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { DataDatabase } from "../../db/database.js";
import { isPostgresError } from "../../db/errors.js";
import { createSource, listSources, updateSource } from "./operations.js";

export function createSourceRoutes(database?: DataDatabase) {
  const app = new Hono<RequestIdEnvironment>();

  app.post("/", validateJson(createSourceRequestSchema), async (c) => {
    const input = c.req.valid("json") as CreateSourceRequest;
    if (!database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }
    try {
      const created = await createSource(database, input);
      return c.json(sourceResponseSchema.parse(created), 201);
    } catch (error) {
      if (isPostgresError(error, "23505")) {
        return problem(
          c,
          409,
          "source_url_conflict",
          "A Source with this URL already exists.",
        );
      }
      throw error;
    }
  });

  app.patch(
    "/:sourceId",
    validateRequest("param", sourceIdParamsSchema),
    validateJson(updateSourceRequestSchema),
    async (c) => {
      const { sourceId } = c.req.valid("param") as { sourceId: number };
      const input = c.req.valid("json") as UpdateSourceRequest;
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }
      try {
        const updated = await updateSource(database, sourceId, input);
        if (!updated) {
          return problem(c, 404, "source_not_found", "Source was not found.");
        }
        return c.json(sourceResponseSchema.parse(updated));
      } catch (error) {
        if (isPostgresError(error, "23505")) {
          return problem(
            c,
            409,
            "source_url_conflict",
            "A Source with this URL already exists.",
          );
        }
        throw error;
      }
    },
  );

  app.get("/", async (c) => {
    if (!database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }
    const result = await listSources(database);
    return c.json(sourceListResponseSchema.parse(result));
  });

  return app;
}
