import {
  createLessonRequestSchema,
  lessonIdParamsSchema,
  lessonTextParamsSchema,
  lessonDetailSchema,
  lessonListResponseSchema,
  patchLessonRequestSchema,
  validateJson,
  validateRequest,
  upsertLessonTextRequestSchema,
  type RequestIdEnvironment,
  type CreateLessonRequest,
  type PatchLessonRequest,
  type UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import type { Hono } from "hono";

import type { BffAppOptions } from "../../app.js";
import { mapDataServiceError } from "../../errors/downstream.js";
import { problem } from "../../errors/problem-details.js";

export function registerAdminLessonRoutes(
  app: Hono<RequestIdEnvironment>,
  options: Pick<BffAppOptions, "dataServiceClient">,
) {
  app.post(
    "/api/admin/lessons",
    validateJson(createLessonRequestSchema),
    async (c) => {
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
    },
  );

  app.patch(
    "/api/admin/lessons/:lessonId",
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
  );

  app.put(
    "/api/admin/lessons/:lessonId/texts/:languageCode",
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
  );

  app.get("/api/admin/lessons", async (c) => {
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
  });

  app.get(
    "/api/admin/lessons/:lessonId",
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
