import {
  languageQuerySchema,
  lessonIdParamsSchema,
  mobileLessonDetailSchema,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import type { BackendAppOptions } from "../../app.js";
import { refuse } from "../../errors/problem-details.js";
import type { RequestIdEnvironment } from "../../middleware/request-id.js";
import { validateRequest } from "../../middleware/validation.js";
import {
  composeMobileLessonDetail,
  composeMobileLessonList,
} from "../../mobile/compose.js";
import { authorizePlayback } from "../../playback.js";

export function createMobileLessonRoutes(
  data: DataModule,
  options: Pick<BackendAppOptions, "storage">,
) {
  return new Hono<RequestIdEnvironment>()
    .get("/", validateRequest("query", languageQuerySchema), async (c) => {
      const { language: languageCode = "th" } = c.req.valid("query");
      const lessons = await data.listLessonsInLanguage(
        languageCode,
        "PUBLISHED",
      );
      if (lessons === "unsupported_language") {
        return refuse(c, lessons);
      }
      return c.json(composeMobileLessonList(lessons.items, languageCode));
    })
    .get(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      validateRequest("query", languageQuerySchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param");
        const { language: languageCode = "th" } = c.req.valid("query");
        const lesson = await data.getPublishedLesson(id, languageCode);
        if (typeof lesson === "string") {
          return refuse(c, lesson);
        }
        const detail = composeMobileLessonDetail(lesson, languageCode);
        if (!detail) {
          return refuse(c, "lesson_text_not_found");
        }
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
      },
    );
}
