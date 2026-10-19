import {
  type CreateLessonRequest,
  createLessonRequestSchema,
  lessonIdParamsSchema,
  lessonTextParamsSchema,
  type PatchLessonRequest,
  patchLessonRequestSchema,
  type RequestIdEnvironment,
  type UpsertLessonTextRequest,
  upsertLessonTextRequestSchema,
  validateJson,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import type { BackendAppOptions } from "../../app.js";
import { problem } from "../../errors/problem-details.js";
import { logStorageFailure } from "../../errors/storage.js";

export function createAdminLessonRoutes(
  data: DataModule,
  options: Pick<BackendAppOptions, "storage">,
) {
  return new Hono<RequestIdEnvironment>()
    .post("/", validateJson(createLessonRequestSchema), async (c) => {
      const detail = await data.createLesson(
        c.req.valid("json") as CreateLessonRequest,
      );
      if (detail === "lesson_not_found") {
        return problem(c, 404, detail, "Lesson was not found.");
      }
      if (detail === "lesson_not_copyable") {
        return problem(
          c,
          409,
          detail,
          "Only Published and Archived Lessons can be copied.",
        );
      }
      c.header("Location", `/api/admin/lessons/${detail.id}`);
      return c.json(detail, 201);
    })
    .patch(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      validateJson(patchLessonRequestSchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param") as { lessonId: number };
        const outcome = await data.patchLesson(
          id,
          c.req.valid("json") as PatchLessonRequest,
        );
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
            "This publication does not replace the chapter's current Published Lesson.",
          );
        }
        if (outcome === "lesson_unchanged") {
          return problem(
            c,
            409,
            outcome,
            "The Draft's Lesson Texts and Lesson Sources are identical to the Published Lesson's.",
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
    )
    .delete(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param") as { lessonId: number };
        if (!options.storage) {
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage is unavailable.",
          );
        }

        const deleted = await data.deleteLesson(id);
        if (deleted === "lesson_not_found") {
          return problem(c, 404, deleted, "Lesson was not found.");
        }
        if (deleted === "lesson_not_editable") {
          return problem(c, 409, deleted, "Only Draft Lessons can be deleted.");
        }
        // The Draft is already gone, so a storage failure only leaves its object behind
        // under the DELETED Media Asset; the keys never leave the Backend.
        for (const asset of deleted.deletedMediaAssets) {
          try {
            await options.storage.deleteObject(asset.objectKey);
          } catch (error) {
            logStorageFailure(c.get("requestId"), "delete", asset.id, error);
          }
        }
        return c.body(null, 204);
      },
    )
    .put(
      "/:lessonId/texts/:languageCode",
      validateRequest("param", lessonTextParamsSchema),
      validateJson(upsertLessonTextRequestSchema),
      async (c) => {
        const { lessonId: id, languageCode } = c.req.valid("param") as {
          lessonId: number;
          languageCode: string;
        };
        const outcome = await data.upsertLessonText(
          id,
          languageCode,
          c.req.valid("json") as UpsertLessonTextRequest,
        );
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
    )
    .get("/", async (c) => c.json(await data.listLessons()))
    .get(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param") as { lessonId: number };
        // Without filters, a missing Lesson is the only refusal.
        const detail = await data.getLesson(id);
        if (typeof detail === "string") {
          return problem(c, 404, "lesson_not_found", "Lesson was not found.");
        }
        return c.json(detail);
      },
    );
}
