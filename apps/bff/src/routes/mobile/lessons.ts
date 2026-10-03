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
import {
  logStorageFailure,
  storageFailureProblem,
} from "../../errors/storage.js";
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
            if (!options.storage)
              return problem(
                c,
                502,
                "storage_unavailable",
                "Storage is unavailable.",
              );
            try {
              const authorization =
                await options.storage.createPlaybackAuthorization(
                  lesson.currentAudio.objectKey,
                );
              audio = {
                mediaAssetId: lesson.currentAudio.mediaAssetId,
                audioVersion: lesson.currentAudio.audioVersion,
                contentType: lesson.currentAudio.contentType,
                sizeBytes: lesson.currentAudio.sizeBytes,
                durationMs: lesson.currentAudio.durationMs,
                playbackUrl: authorization.playbackUrl,
                playbackExpiresAt: authorization.expiresAt,
              };
            } catch (error) {
              logStorageFailure(
                c.get("requestId"),
                "playback",
                lesson.currentAudio.mediaAssetId,
                error,
              );
              return storageFailureProblem(c, error, false);
            }
          }
          c.header("Cache-Control", "no-store");
          return c.json(mobileLessonDetailSchema.parse({ ...detail, audio }));
        } catch (error) {
          return mapDataServiceError(c, error);
        }
      },
    );
}
