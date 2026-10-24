import {
  lessonSourceParamsSchema,
  upsertLessonSourceRequestSchema,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import { refuse } from "../../errors/problem-details.js";
import type { RequestIdEnvironment } from "../../middleware/request-id.js";
import { validateJson, validateRequest } from "../../middleware/validation.js";

export function createAdminLessonSourceRoutes(data: DataModule) {
  return new Hono<RequestIdEnvironment>()
    .put(
      "/:lessonId/sources/:sourceId",
      validateRequest("param", lessonSourceParamsSchema),
      validateJson(upsertLessonSourceRequestSchema),
      async (c) => {
        const { lessonId, sourceId } = c.req.valid("param");
        const outcome = await data.upsertLessonSource(
          lessonId,
          sourceId,
          c.req.valid("json"),
        );
        return typeof outcome === "string"
          ? refuse(c, outcome)
          : c.json(outcome);
      },
    )
    .delete(
      "/:lessonId/sources/:sourceId",
      validateRequest("param", lessonSourceParamsSchema),
      async (c) => {
        const { lessonId, sourceId } = c.req.valid("param");
        const outcome = await data.deleteLessonSource(lessonId, sourceId);
        return outcome ? refuse(c, outcome) : c.body(null, 204);
      },
    );
}
