import {
  languageQuerySchema,
  lessonIdParamsSchema,
  mobileLessonDetailSchema,
  validateRequest,
  type RequestIdEnvironment,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { BffAppOptions } from "../../app.js";
import { mapDataServiceError } from "../../errors/downstream.js";
import { problem } from "../../errors/problem-details.js";
import { authorizePlayback } from "../../playback.js";
import {
  composeMobileLessonDetail,
  composeMobileLessonList,
} from "../../mobile/compose.js";

export function createMobileLessonRoutes(
  options: Pick<BffAppOptions, "dataServiceClient" | "storage">,
) {
  return new Hono<RequestIdEnvironment>()
    .get("/", validateRequest("query", languageQuerySchema), async (c) => {
      const { language: languageCode = "th" } = c.req.valid("query") as {
        language?: string;
      };
      if (!options.dataServiceClient)
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      try {
        const { items } = await options.dataServiceClient.listPublishedLessons(
          languageCode,
          c.get("requestId"),
        );
        return c.json(composeMobileLessonList(items, languageCode));
      } catch (error) {
        return mapDataServiceError(c, error);
      }
    })
    .get(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      validateRequest("query", languageQuerySchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param") as { lessonId: number };
        const { language: languageCode = "th" } = c.req.valid("query") as {
          language?: string;
        };
        if (!options.dataServiceClient)
          return problem(
            c,
            502,
            "data_service_unavailable",
            "The Data Service is unavailable.",
          );
        try {
          const lesson = await options.dataServiceClient.getPublishedLesson(
            id,
            languageCode,
            c.get("requestId"),
          );
          const detail = composeMobileLessonDetail(lesson, languageCode);
          if (!detail)
            return problem(
              c,
              404,
              "lesson_text_not_found",
              "Lesson Text was not found.",
            );
          let audio = null;
          if (lesson.currentAudio) {
            const { objectKey, ...current } = lesson.currentAudio;
            const playback = await authorizePlayback(c, options.storage, {
              mediaAssetId: current.mediaAssetId,
              objectKey,
            });
            if (playback instanceof Response) return playback;
            audio = { ...current, ...playback };
          }
          c.header("Cache-Control", "no-store");
          return c.json(mobileLessonDetailSchema.parse({ ...detail, audio }));
        } catch (error) {
          return mapDataServiceError(c, error);
        }
      },
    );
}
