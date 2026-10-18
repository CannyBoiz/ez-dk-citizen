import {
  languageQuerySchema,
  lessonIdParamsSchema,
  mobileLessonDetailSchema,
  type RequestIdEnvironment,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import type { BackendAppOptions } from "../../app.js";
import { refuseWith } from "../../errors/problem-details.js";
import {
  composeMobileLessonDetail,
  composeMobileLessonList,
} from "../../mobile/compose.js";
import { authorizePlayback } from "../../playback.js";

const refuse = refuseWith({
  lesson_not_found: [404, "Lesson was not found."],
  lesson_text_not_found: [404, "Lesson Text was not found."],
  unsupported_language: [422, "Language is not supported."],
});

export function createMobileLessonRoutes(
  data: DataModule,
  options: Pick<BackendAppOptions, "storage">,
) {
  return new Hono<RequestIdEnvironment>()
    .get("/", validateRequest("query", languageQuerySchema), async (c) => {
      const { language: languageCode = "th" } = c.req.valid("query") as {
        language?: string;
      };
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
        const { lessonId: id } = c.req.valid("param") as { lessonId: number };
        const { language: languageCode = "th" } = c.req.valid("query") as {
          language?: string;
        };
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
