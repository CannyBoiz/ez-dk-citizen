import {
  type CreateLessonRequest,
  createLessonRequestSchema,
  type LessonStatus,
  lessonIdParamsSchema,
  lessonLanguageParamsSchema,
  lessonReadQuerySchema,
  lessonSourceParamsSchema,
  lessonTextParamsSchema,
  type PatchLessonRequest,
  patchLessonRequestSchema,
  problem,
  type RequestIdEnvironment,
  type UpsertLessonSourceRequest,
  type UpsertLessonTextRequest,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
  validateJson,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { DataOperations } from "../../data-operations.js";

export function createLessonRoutes(data: DataOperations) {
  const app = new Hono<RequestIdEnvironment>();

  app.post("/", validateJson(createLessonRequestSchema), async (c) => {
    const input = c.req.valid("json") as CreateLessonRequest;
    return c.json(await data.createLesson(input), 201);
  });

  app.patch(
    "/:lessonId",
    validateRequest("param", lessonIdParamsSchema),
    validateJson(patchLessonRequestSchema),
    async (c) => {
      const { lessonId: id } = c.req.valid("param") as { lessonId: number };
      const input = c.req.valid("json") as PatchLessonRequest;

      const outcome = await data.patchLesson(id, input);

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
      }
      if (outcome === "unsupported_language") {
        return problem(c, 422, outcome, "Language is not supported.");
      }
      if (outcome === "lesson_lifecycle_conflict") {
        return problem(
          c,
          409,
          outcome,
          "Lesson status transition is not allowed.",
        );
      }
      if (outcome === "change_kind_required") {
        return problem(
          c,
          422,
          "validation_failed",
          "A change kind is required to publish this Lesson.",
          [
            {
              path: ["changeKind"],
              message:
                "Choose a content change or a fix: this chapter already has a version.",
            },
          ],
        );
      }
      if (outcome === "published_lesson_conflict") {
        return problem(
          c,
          409,
          outcome,
          "This chapter already has a Published Lesson.",
        );
      }
      if (outcome === "lesson_version_conflict") {
        return problem(
          c,
          409,
          outcome,
          "A Lesson with this chapter and version already exists.",
        );
      }
      if ("missing" in outcome) {
        return problem(
          c,
          409,
          "lesson_publication_incomplete",
          "Lesson is missing publication prerequisites.",
          outcome.missing,
        );
      }

      return c.json(outcome);
    },
  );

  app.delete(
    "/:lessonId",
    validateRequest("param", lessonIdParamsSchema),
    async (c) => {
      const { lessonId: id } = c.req.valid("param") as { lessonId: number };

      const outcome = await data.deleteLesson(id);

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be deleted.");
      }
      return c.json(outcome);
    },
  );

  app.put(
    "/:lessonId/texts/:languageCode",
    validateRequest("param", lessonTextParamsSchema),
    validateJson(upsertLessonTextRequestSchema),
    async (c) => {
      const { lessonId: id, languageCode } = c.req.valid("param") as {
        lessonId: number;
        languageCode: string;
      };
      const input = c.req.valid("json") as UpsertLessonTextRequest;

      const outcome = await data.upsertLessonText(id, languageCode, input);

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
      }
      if (outcome === "unsupported_language") {
        return problem(c, 422, outcome, "Language is not supported.");
      }
      return c.json(outcome);
    },
  );

  app.put(
    "/:lessonId/sources/:sourceId",
    validateRequest("param", lessonSourceParamsSchema),
    validateJson(upsertLessonSourceRequestSchema),
    async (c) => {
      const { lessonId, sourceId } = c.req.valid("param") as {
        lessonId: number;
        sourceId: number;
      };
      const input = c.req.valid("json") as UpsertLessonSourceRequest;

      const outcome = await data.upsertLessonSource(lessonId, sourceId, input);

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "source_not_found") {
        return problem(c, 404, outcome, "Source was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
      }
      return c.json(outcome);
    },
  );

  app.delete(
    "/:lessonId/sources/:sourceId",
    validateRequest("param", lessonSourceParamsSchema),
    async (c) => {
      const { lessonId, sourceId } = c.req.valid("param") as {
        lessonId: number;
        sourceId: number;
      };

      const outcome = await data.deleteLessonSource(lessonId, sourceId);

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "source_not_found") {
        return problem(c, 404, outcome, "Source was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
      }
      return c.body(null, 204);
    },
  );

  app.get("/", validateRequest("query", lessonReadQuerySchema), async (c) => {
    const { language: languageCode, status: filteredStatus } = c.req.valid(
      "query",
    ) as { language?: string; status?: LessonStatus };
    if (languageCode === undefined) {
      return c.json(await data.listLessons(filteredStatus));
    }
    const result = await data.listLessonsInLanguage(
      languageCode,
      filteredStatus,
    );
    if (result === "unsupported_language") {
      return problem(c, 422, result, "Language is not supported.");
    }
    return c.json(result);
  });

  app.get(
    "/:lessonId",
    validateRequest("param", lessonIdParamsSchema),
    validateRequest("query", lessonReadQuerySchema),
    async (c) => {
      const { lessonId: id } = c.req.valid("param") as { lessonId: number };
      const { language: languageCode, status: filteredStatus } = c.req.valid(
        "query",
      ) as { language?: string; status?: LessonStatus };
      const detail =
        filteredStatus === "PUBLISHED" && languageCode
          ? await data.getPublishedLesson(id, languageCode)
          : await data.getLesson(id, {
              language: languageCode,
              status: filteredStatus,
            });
      if (detail === "unsupported_language") {
        return problem(c, 422, detail, "Language is not supported.");
      }
      if (detail === "lesson_not_found") {
        return problem(c, 404, detail, "Lesson was not found.");
      }
      if (detail === "lesson_text_not_found") {
        return problem(c, 404, detail, "Lesson Text was not found.");
      }
      return c.json(detail);
    },
  );

  app.get(
    "/:lessonId/audio/:languageCode",
    validateRequest("param", lessonLanguageParamsSchema),
    async (c) => {
      const { lessonId: id, languageCode } = c.req.valid("param") as {
        lessonId: number;
        languageCode: string;
      };

      const outcome = await data.getCurrentLessonAudio(id, languageCode);
      if (outcome === "unsupported_language") {
        return problem(c, 422, outcome, "Language is not supported.");
      }
      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      return c.json(outcome);
    },
  );

  return app;
}
