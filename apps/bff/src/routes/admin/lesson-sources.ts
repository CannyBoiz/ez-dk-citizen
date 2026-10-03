import {
  lessonSourceParamsSchema,
  lessonDetailSchema,
  validateJson,
  validateRequest,
  upsertLessonSourceRequestSchema,
  type RequestIdEnvironment,
  type UpsertLessonSourceRequest,
} from "@ez-dk-citizen/api-contracts";
import type { Hono } from "hono";

import type { BffAppOptions } from "../../app.js";
import { mapDataServiceError } from "../../errors/downstream.js";
import { problem } from "../../errors/problem-details.js";
export function registerAdminLessonSourceRoutes(
  app: Hono<RequestIdEnvironment>,
  options: Pick<BffAppOptions, "dataServiceClient">,
) {
  app.put(
    "/api/admin/lessons/:lessonId/sources/:sourceId",
    validateRequest("param", lessonSourceParamsSchema),
    validateJson(upsertLessonSourceRequestSchema),
    async (c) => {
      const { lessonId, sourceId } = c.req.valid("param") as {
        lessonId: number;
        sourceId: number;
      };
      const input = c.req.valid("json") as UpsertLessonSourceRequest;
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
          lessonDetailSchema.parse(
            await options.dataServiceClient.upsertLessonSource(
              lessonId,
              sourceId,
              input,
              c.get("requestId"),
            ),
          ),
        );
      } catch (error) {
        return mapDataServiceError(c, error);
      }
    },
  );

  app.delete(
    "/api/admin/lessons/:lessonId/sources/:sourceId",
    validateRequest("param", lessonSourceParamsSchema),
    async (c) => {
      const { lessonId, sourceId } = c.req.valid("param") as {
        lessonId: number;
        sourceId: number;
      };
      if (!options.dataServiceClient) {
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      }
      try {
        await options.dataServiceClient.deleteLessonSource(
          lessonId,
          sourceId,
          c.get("requestId"),
        );
        return c.body(null, 204);
      } catch (error) {
        return mapDataServiceError(c, error);
      }
    },
  );
}
