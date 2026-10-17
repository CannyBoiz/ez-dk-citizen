import {
  lessonSourceParamsSchema,
  type RequestIdEnvironment,
  type UpsertLessonSourceRequest,
  upsertLessonSourceRequestSchema,
  validateJson,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import { problem } from "../../errors/problem-details.js";

// The refusals both Lesson Source routes answer.
const refusals = {
  lesson_not_found: [404, "Lesson was not found."],
  source_not_found: [404, "Source was not found."],
  lesson_not_editable: [409, "Only Draft Lessons can be edited."],
} as const;

function refuse(
  c: Parameters<typeof problem>[0],
  outcome: keyof typeof refusals,
) {
  const [status, detail] = refusals[outcome];
  return problem(c, status, outcome, detail);
}

export function createAdminLessonSourceRoutes(data: DataModule) {
  return new Hono<RequestIdEnvironment>()
    .put(
      "/:lessonId/sources/:sourceId",
      validateRequest("param", lessonSourceParamsSchema),
      validateJson(upsertLessonSourceRequestSchema),
      async (c) => {
        const { lessonId, sourceId } = c.req.valid("param") as {
          lessonId: number;
          sourceId: number;
        };
        const outcome = await data.upsertLessonSource(
          lessonId,
          sourceId,
          c.req.valid("json") as UpsertLessonSourceRequest,
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
        const { lessonId, sourceId } = c.req.valid("param") as {
          lessonId: number;
          sourceId: number;
        };
        const outcome = await data.deleteLessonSource(lessonId, sourceId);
        return outcome ? refuse(c, outcome) : c.body(null, 204);
      },
    );
}
