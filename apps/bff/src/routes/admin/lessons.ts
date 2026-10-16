import {
  type CreateLessonRequest,
  createLessonRequestSchema,
  type DeleteLessonResponse,
  lessonDetailSchema,
  lessonIdParamsSchema,
  lessonListResponseSchema,
  lessonTextParamsSchema,
  type PatchLessonRequest,
  patchLessonRequestSchema,
  type RequestIdEnvironment,
  type UpsertLessonTextRequest,
  upsertLessonTextRequestSchema,
  validateJson,
  validateRequest,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";

import type { BffAppOptions } from "../../app.js";
import { mapDataServiceError } from "../../errors/downstream.js";
import { problem } from "../../errors/problem-details.js";
import { logStorageFailure } from "../../errors/storage.js";

export function createAdminLessonRoutes(
  options: Pick<BffAppOptions, "dataServiceClient" | "storage">,
) {
  return new Hono<RequestIdEnvironment>()
    .post("/", validateJson(createLessonRequestSchema), async (c) => {
      const input = c.req.valid("json") as CreateLessonRequest;
      if (!options.dataServiceClient) {
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      }

      try {
        const detail = await options.dataServiceClient.createLesson(
          input,
          c.get("requestId"),
        );
        c.header("Location", `/api/admin/lessons/${detail.id}`);
        return c.json(lessonDetailSchema.parse(detail), 201);
      } catch (error) {
        return mapDataServiceError(c, error);
      }
    })
    .patch(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      validateJson(patchLessonRequestSchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param") as { lessonId: number };
        const input = c.req.valid("json") as PatchLessonRequest;
        if (!options.dataServiceClient) {
          return problem(
            c,
            502,
            "data_service_unavailable",
            "The Data Service is unavailable.",
          );
        }
        try {
          return c.json(
            lessonDetailSchema.parse(
              await options.dataServiceClient.patchLesson(
                id,
                input,
                c.get("requestId"),
              ),
            ),
          );
        } catch (error) {
          return mapDataServiceError(c, error);
        }
      },
    )
    .delete(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param") as { lessonId: number };
        if (!options.dataServiceClient) {
          return problem(
            c,
            502,
            "data_service_unavailable",
            "The Data Service is unavailable.",
          );
        }
        if (!options.storage) {
          return problem(
            c,
            502,
            "storage_unavailable",
            "Storage is unavailable.",
          );
        }

        let deleted: DeleteLessonResponse;
        try {
          deleted = await options.dataServiceClient.deleteLesson(
            id,
            c.get("requestId"),
          );
        } catch (error) {
          return mapDataServiceError(c, error);
        }
        // The Draft is already gone, so a storage failure only leaves its object behind
        // under the DELETED Media Asset; the keys never leave the BFF.
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
        const input = c.req.valid("json") as UpsertLessonTextRequest;
        if (!options.dataServiceClient) {
          return problem(
            c,
            502,
            "data_service_unavailable",
            "The Data Service is unavailable.",
          );
        }

        try {
          return c.json(
            lessonDetailSchema.parse(
              await options.dataServiceClient.upsertLessonText(
                id,
                languageCode,
                input,
                c.get("requestId"),
              ),
            ),
          );
        } catch (error) {
          return mapDataServiceError(c, error);
        }
      },
    )
    .get("/", async (c) => {
      if (!options.dataServiceClient) {
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      }
      try {
        return c.json(
          lessonListResponseSchema.parse(
            await options.dataServiceClient.listLessons(c.get("requestId")),
          ),
        );
      } catch (error) {
        return mapDataServiceError(c, error);
      }
    })
    .get(
      "/:lessonId",
      validateRequest("param", lessonIdParamsSchema),
      async (c) => {
        const { lessonId: id } = c.req.valid("param") as { lessonId: number };
        if (!options.dataServiceClient) {
          return problem(
            c,
            502,
            "data_service_unavailable",
            "The Data Service is unavailable.",
          );
        }
        try {
          return c.json(
            lessonDetailSchema.parse(
              await options.dataServiceClient.getLesson(id, c.get("requestId")),
            ),
          );
        } catch (error) {
          return mapDataServiceError(c, error);
        }
      },
    );
}
