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
        return outcome.ok ? c.json(outcome.value) : refuse(c, outcome.code);
      },
    )
    .delete(
      "/:lessonId/sources/:sourceId",
      validateRequest("param", lessonSourceParamsSchema),
      async (c) => {
        const { lessonId, sourceId } = c.req.valid("param");
        const outcome = await data.deleteLessonSource(lessonId, sourceId);
        return outcome.ok ? c.body(null, 204) : refuse(c, outcome.code);
      },
    );
}
