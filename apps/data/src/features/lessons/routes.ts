import {
  createLessonRequestSchema,
  currentLessonAudioResponseSchema,
  lessonIdParamsSchema,
  lessonReadQuerySchema,
  lessonSourceParamsSchema,
  lessonLanguageParamsSchema,
  lessonTextParamsSchema,
  lessonDetailSchema,
  lessonDetailListResponseSchema,
  lessonListResponseSchema,
  patchLessonRequestSchema,
  publishedLessonDetailSchema,
  problem,
  validateJson,
  validateRequest,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
  type CreateLessonRequest,
  type LessonStatus,
  type PatchLessonRequest,
  type RequestIdEnvironment,
  type UpsertLessonSourceRequest,
  type UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { DataDatabase } from "../../db/database.js";
import { isPostgresError } from "../../db/errors.js";
import {
  createLesson,
  patchLesson,
  upsertLessonText,
  upsertLessonSource,
  deleteLessonSource,
} from "./mutations.js";
import {
  listLessons,
  loadLessonDetail,
  readCurrentLessonAudio,
  readLesson,
} from "./queries.js";

export function createLessonRoutes(database?: DataDatabase) {
  const app = new Hono<RequestIdEnvironment>();

  app.post("/", validateJson(createLessonRequestSchema), async (c) => {
    const input = c.req.valid("json") as CreateLessonRequest;
    if (!database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }

    try {
      const id = await createLesson(database, input);
      const detail = await loadLessonDetail(database, id);
      if (!detail) throw new Error("Created Lesson could not be read.");
      return c.json(lessonDetailSchema.parse(detail), 201);
    } catch (error) {
      if (isPostgresError(error, "23505")) {
        return problem(
          c,
          409,
          "lesson_version_conflict",
          "A Lesson with this chapter and version already exists.",
        );
      }
      throw error;
    }
  });

  app.patch(
    "/:lessonId",
    validateRequest("param", lessonIdParamsSchema),
    validateJson(patchLessonRequestSchema),
    async (c) => {
      const { lessonId: id } = c.req.valid("param") as { lessonId: number };
      const input = c.req.valid("json") as PatchLessonRequest;
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      try {
        const outcome = await patchLesson(database, id, input);

        if (outcome === "lesson_not_found") {
          return problem(c, 404, outcome, "Lesson was not found.");
        }
        if (outcome === "lesson_not_editable") {
          return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
        }
        if (outcome === "lesson_lifecycle_conflict") {
          return problem(
            c,
            409,
            outcome,
            "Lesson status transition is not allowed.",
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
        if (outcome === "published_lesson_conflict") {
          return problem(
            c,
            409,
            outcome,
            "This chapter already has a Published Lesson.",
          );
        }
        if (typeof outcome === "object") {
          return problem(
            c,
            409,
            "lesson_publication_incomplete",
            "Lesson is missing publication prerequisites.",
            outcome.missing,
          );
        }

        const detail = await loadLessonDetail(database, outcome);
        if (!detail) throw new Error("Updated Lesson could not be read.");
        return c.json(lessonDetailSchema.parse(detail));
      } catch (error) {
        if (
          isPostgresError(error, "23505", "lesson_one_published_per_chapter")
        ) {
          return problem(
            c,
            409,
            "published_lesson_conflict",
            "This chapter already has a Published Lesson.",
          );
        }
        if (isPostgresError(error, "23505")) {
          return problem(
            c,
            409,
            "lesson_version_conflict",
            "A Lesson with this chapter and version already exists.",
          );
        }
        throw error;
      }
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
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await upsertLessonText(database, id, languageCode, input);

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
      }
      if (outcome === "unsupported_language") {
        return problem(c, 422, outcome, "Language is not supported.");
      }

      const detail = await loadLessonDetail(database, outcome);
      if (!detail) throw new Error("Updated Lesson could not be read.");
      return c.json(lessonDetailSchema.parse(detail));
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
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await upsertLessonSource(
        database,
        lessonId,
        sourceId,
        input,
      );

      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      if (outcome === "source_not_found") {
        return problem(c, 404, outcome, "Source was not found.");
      }
      if (outcome === "lesson_not_editable") {
        return problem(c, 409, outcome, "Only Draft Lessons can be edited.");
      }

      const detail = await loadLessonDetail(database, outcome);
      if (!detail) throw new Error("Updated Lesson could not be read.");
      return c.json(lessonDetailSchema.parse(detail));
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
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await deleteLessonSource(database, lessonId, sourceId);

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
    if (!database) {
      return problem(
        c,
        500,
        "internal_error",
        "The request could not be completed.",
      );
    }

    const { language: languageCode, status: filteredStatus } = c.req.valid(
      "query",
    ) as { language?: string; status?: LessonStatus };
    const result = await listLessons(database, {
      language: languageCode,
      status: filteredStatus,
    });
    if (result === "unsupported_language") {
      return problem(c, 422, result, "Language is not supported.");
    }
    return c.json(
      languageCode !== undefined
        ? lessonDetailListResponseSchema.parse(result)
        : lessonListResponseSchema.parse(result),
    );
  });

  app.get(
    "/:lessonId",
    validateRequest("param", lessonIdParamsSchema),
    validateRequest("query", lessonReadQuerySchema),
    async (c) => {
      const { lessonId: id } = c.req.valid("param") as { lessonId: number };
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const { language: languageCode, status: filteredStatus } = c.req.valid(
        "query",
      ) as { language?: string; status?: LessonStatus };
      const detail = await readLesson(database, id, {
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
      return c.json(
        filteredStatus === "PUBLISHED" && languageCode
          ? publishedLessonDetailSchema.parse(detail)
          : lessonDetailSchema.parse(detail),
      );
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
      if (!database) {
        return problem(
          c,
          500,
          "internal_error",
          "The request could not be completed.",
        );
      }

      const outcome = await readCurrentLessonAudio(database, id, languageCode);
      if (outcome === "unsupported_language") {
        return problem(c, 422, outcome, "Language is not supported.");
      }
      if (outcome === "lesson_not_found") {
        return problem(c, 404, outcome, "Lesson was not found.");
      }
      return c.json(currentLessonAudioResponseSchema.parse(outcome));
    },
  );

  return app;
}
