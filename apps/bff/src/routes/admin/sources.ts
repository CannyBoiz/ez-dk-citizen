import {
  type CreateSourceRequest,
  createSourceRequestSchema,
  type RequestIdEnvironment,
  sourceListResponseSchema,
  sourceResponseSchema,
  validateJson,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { BffAppOptions } from "../../app.js";
import { mapDataServiceError } from "../../errors/downstream.js";
import { problem } from "../../errors/problem-details.js";

export function createAdminSourceRoutes(
  options: Pick<BffAppOptions, "dataServiceClient">,
) {
  return new Hono<RequestIdEnvironment>()
    .post("/", validateJson(createSourceRequestSchema), async (c) => {
      const input = c.req.valid("json") as CreateSourceRequest;
      if (!options.dataServiceClient) {
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      }
      try {
        const source = await options.dataServiceClient.createSource(
          input,
          c.get("requestId"),
        );
        c.header("Location", `/api/admin/sources/${source.id}`);
        return c.json(sourceResponseSchema.parse(source), 201);
      } catch (error) {
        return mapDataServiceError(c, error);
      }
    })
    .get("/", async (c) => {
      if (!options.dataServiceClient) {
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      }
      try {
        return c.json(
          sourceListResponseSchema.parse(
            await options.dataServiceClient.listSources(c.get("requestId")),
          ),
        );
      } catch (error) {
        return mapDataServiceError(c, error);
      }
    });
}
