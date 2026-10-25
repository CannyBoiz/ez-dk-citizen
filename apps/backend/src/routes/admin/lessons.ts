import {
  createLessonRequestSchema,
  lessonIdParamsSchema,
  lessonTextParamsSchema,
  patchLessonRequestSchema,
  upsertLessonTextRequestSchema,
} from "@ez-dk-citizen/api-contracts";
import type { DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";

import type { BackendAppOptions } from "../../app.js";
import { problem, refuse, refuseWith } from "../../errors/problem-details.js";
import { logStorageFailure } from "../../errors/storage.js";
import type { RequestIdEnvironment } from "../../middleware/request-id.js";
import { validateJson, validateRequest } from "../../middleware/validation.js";

// Draft deletion says "deleted" where every other Lesson edit says "edited" (Stage 4b spec).
const refuseDeletion = refuseWith({
  lesson_not_editable: [409, "Only Draft Lessons can be deleted."],
});

export function createAdminLessonRoutes(
  data: DataModule,
  options: Pick<BackendAppOptions, "storage">,
) {
  return new Hono<RequestIdEnvironment>()
    .post("/", validateJson(createLessonRequestSchema), async (c) => {
      const created = await data.createLesson(c.req.valid("json"));
      if (typeof created === "string") {
        return refuse(c, created);
      }
      c.header("Location", `/api/admin/lessons/${created.id}`);
      return c.json(created, 201);
    })
    .patch(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      validateJson(patchLessonRequestSchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param");
        const outcome = await data.patchLesson(id, c.req.valid("json"));
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
        if (typeof outcome === "string") {
          return refuse(c, outcome);
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
        const { lessonId: id } = c.req.valid("param");
        if (!options.storage) {
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage is unavailable.",
          );
        }

        const deleted = await data.deleteLesson(id);
        if (typeof deleted === "string") {
          return refuseDeletion(c, deleted);
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
        const { lessonId: id, languageCode } = c.req.valid("param");
        const outcome = await data.upsertLessonText(
          id,
          languageCode,
          c.req.valid("json"),
        );
        if (typeof outcome === "string") {
          return refuse(c, outcome);
        }
        return c.json(outcome);
      },
    )
    .get("/", async (c) => c.json(await data.listLessons()))
    .get(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param");
        const lesson = await data.getLesson(id);
        if (typeof lesson === "string") {
          return refuse(c, lesson);
        }
        return c.json(lesson);
      },
    );
}
