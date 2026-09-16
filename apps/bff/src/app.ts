import {
  completeMediaAssetRequestSchema,
  completeMediaAssetResponseSchema,
  createUploadIntentRequestSchema,
  createSourceRequestSchema,
  createLessonRequestSchema,
  languageQuerySchema,
  lessonIdParamsSchema,
  mediaAssetIdParamsSchema,
  lessonSourceParamsSchema,
  lessonTextParamsSchema,
  lessonDetailSchema,
  lessonListResponseSchema,
  mobileLessonDetailSchema,
  mobileLessonListResponseSchema,
  livenessResponseSchema,
  patchLessonRequestSchema,
  readinessResponseSchema,
  installRequestLifecycle,
  problem,
  requireBearerToken,
  validateJson,
  validateRequest,
  sourceListResponseSchema,
  sourceResponseSchema,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
  uploadIntentResponseSchema,
  type RequestIdEnvironment,
  type CreateUploadIntentRequest,
  type CompleteMediaAssetRequest,
  type CreateLessonRequest,
  type CreateSourceRequest,
  type PatchLessonRequest,
  type UpsertLessonSourceRequest,
  type UpsertLessonTextRequest,
} from "@ez-dk-citizen/api-contracts";
import { randomUUID } from "node:crypto";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { Hono } from "hono";

import {
  DataServiceError,
  type DataServiceClient,
} from "./data-service-client.js";
import type { Storage } from "./storage.js";
export interface BffAppOptions {
  adminApiToken?: string;
  adminOrigins?: string[];
  dataServiceClient?: DataServiceClient;
  storage?: Storage;
  storageBucket?: string;
}

export function createBffApp(
  checkDataServiceReadiness: () => Promise<void>,
  options: BffAppOptions = {},
) {
  const app = new Hono<RequestIdEnvironment>();

  installRequestLifecycle(app);
  app.onError((error, c) => {
    if (error instanceof HTTPException && error.status === 400) {
      return problem(
        c,
        400,
        "malformed_json",
        "Request body is not valid JSON.",
      );
    }
    return problem(
      c,
      500,
      "internal_error",
      "The request could not be completed.",
    );
  });
  app.notFound((c) =>
    problem(c, 404, "not_found", "The requested resource was not found."),
  );

  app.get("/health", (c) =>
    c.json(livenessResponseSchema.parse({ status: "ok" })),
  );
  app.get("/ready", async (c) => {
    try {
      await checkDataServiceReadiness();
      return c.json(readinessResponseSchema.parse({ status: "ok" }));
    } catch {
      return c.json(
        readinessResponseSchema.parse({ status: "unavailable" }),
        503,
      );
    }
  });

  app.use(
    "/api/admin/*",
    cors({
      origin: (origin) =>
        origin && options.adminOrigins?.includes(origin) ? origin : undefined,
      allowMethods: ["DELETE", "GET", "PATCH", "POST", "PUT", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type", "X-Request-ID"],
      credentials: false,
    }),
  );
  app.use("/api/admin/*", requireBearerToken(options.adminApiToken));
  app.use(
    "/api/admin/*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) =>
        problem(c, 422, "body_too_large", "Request body exceeds 1 MiB."),
    }),
  );

  app.post(
    "/api/admin/media/upload-intents",
    validateJson(createUploadIntentRequestSchema),
    async (c) => {
      const input = c.req.valid("json") as CreateUploadIntentRequest;
      if (!options.dataServiceClient) {
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      }
      if (!options.storage || !options.storageBucket) {
        return problem(
          c,
          502,
          "storage_unavailable",
          "Storage authorization is unavailable.",
        );
      }

      const objectKey = `audio/${randomUUID()}.mp3`;
      try {
        const mediaAsset =
          await options.dataServiceClient.createPendingMediaAsset(
            {
              languageCode: input.languageCode,
              storageProvider: "s3",
              storageContainer: options.storageBucket,
              objectKey,
              originalFilename: input.originalFilename,
              contentType: input.contentType,
              sizeBytes: input.sizeBytes,
            },
            c.get("requestId"),
          );
        const authorization = await options.storage.createUploadAuthorization({
          key: objectKey,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        });
        return c.json(
          uploadIntentResponseSchema.parse({
            mediaAssetId: mediaAsset.id,
            ...authorization,
          }),
          201,
        );
      } catch (error) {
        if (error instanceof DataServiceError)
          return mapDataServiceError(c, error);
        return problem(
          c,
          502,
          "storage_unavailable",
          "Storage authorization is unavailable.",
        );
      }
    },
  );

  app.post(
    "/api/admin/media/:mediaAssetId/complete",
    validateRequest("param", mediaAssetIdParamsSchema),
    validateJson(completeMediaAssetRequestSchema),
    async (c) => {
      const { mediaAssetId } = c.req.valid("param") as {
        mediaAssetId: number;
      };
      const input = c.req.valid("json") as CompleteMediaAssetRequest;
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

      try {
        const asset = await options.dataServiceClient.getMediaAsset(
          mediaAssetId,
          c.get("requestId"),
        );
        if (asset.status === "PENDING") {
          let object: { contentType?: string; sizeBytes?: number };
          try {
            object = await options.storage.inspectObject(asset.objectKey);
          } catch (error) {
            logStorageFailure(c.get("requestId"), "inspect", asset.id, error);
            return storageFailureProblem(c, error);
          }
          if (
            object.contentType !== asset.contentType ||
            object.sizeBytes !== asset.sizeBytes
          ) {
            await options.dataServiceClient.failMediaAsset(
              mediaAssetId,
              c.get("requestId"),
            );
            try {
              await options.storage.deleteObject(asset.objectKey);
            } catch (error) {
              logStorageFailure(c.get("requestId"), "delete", asset.id, error);
            }
            return problem(
              c,
              422,
              "invalid_uploaded_media",
              "Uploaded object does not match its declared media metadata.",
            );
          }
        }
        return c.json(
          completeMediaAssetResponseSchema.parse(
            await options.dataServiceClient.completeMediaAsset(
              mediaAssetId,
              input,
              c.get("requestId"),
            ),
          ),
        );
      } catch (error) {
        if (error instanceof DataServiceError)
          return mapDataServiceError(c, error);
        return problem(
          c,
          502,
          "storage_unavailable",
          "Storage is unavailable.",
        );
      }
    },
  );

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

  app.post(
    "/api/admin/sources",
    validateJson(createSourceRequestSchema),
    async (c) => {
      const input = c.req.valid("json") as CreateSourceRequest;
      if (!options.dataServiceClient) {
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      }
      try {
        const source = await options.dataServiceClient.createSource(
          input,
          c.get("requestId"),
        );
        c.header("Location", `/api/admin/sources/${source.id}`);
        return c.json(sourceResponseSchema.parse(source), 201);
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

  app.put(
    "/api/admin/lessons/:lessonId/sources/:sourceId",
    validateRequest("param", lessonSourceParamsSchema),
    validateJson(upsertLessonSourceRequestSchema),
    async (c) => {
      const { lessonId, sourceId } = c.req.valid("param") as {
        lessonId: number;
        sourceId: number;
      };
      const input = c.req.valid("json") as UpsertLessonSourceRequest;
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
            await options.dataServiceClient.upsertLessonSource(
              lessonId,
              sourceId,
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

  app.delete(
    "/api/admin/lessons/:lessonId/sources/:sourceId",
    validateRequest("param", lessonSourceParamsSchema),
    async (c) => {
      const { lessonId, sourceId } = c.req.valid("param") as {
        lessonId: number;
        sourceId: number;
      };
      if (!options.dataServiceClient) {
        return problem(
          c,
          502,
          "data_service_unavailable",
          "The Data Service is unavailable.",
        );
      }
      try {
        await options.dataServiceClient.deleteLessonSource(
          lessonId,
          sourceId,
          c.get("requestId"),
        );
        return c.body(null, 204);
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

  app.get("/api/admin/sources", async (c) => {
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
        sourceListResponseSchema.parse(
          await options.dataServiceClient.listSources(c.get("requestId")),
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

  app.get(
    "/api/mobile/lessons",
    validateRequest("query", languageQuerySchema),
    async (c) => {
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
        return c.json(
          mobileLessonListResponseSchema.parse({
            items: items.flatMap((lesson) => {
              const text = lesson.lessonTexts.find(
                (item) => item.languageCode === languageCode,
              );
              return text
                ? [
                    {
                      id: lesson.id,
                      chapter: lesson.chapter,
                      version: lesson.version,
                      languageCode,
                      title: text.title,
                    },
                  ]
                : [];
            }),
          }),
        );
      } catch (error) {
        return mapDataServiceError(c, error);
      }
    },
  );

  app.get(
    "/api/mobile/lessons/:lessonId",
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
        const text = lesson.lessonTexts.find(
          (item) => item.languageCode === languageCode,
        );
        if (!text)
          return problem(
            c,
            404,
            "lesson_text_not_found",
            "Lesson Text was not found.",
          );
        return c.json(
          mobileLessonDetailSchema.parse({
            id: lesson.id,
            chapter: lesson.chapter,
            version: lesson.version,
            languageCode,
            title: text.title,
            content: text.content,
            availableLanguageCodes: lesson.availableLanguageCodes,
            lessonSources: lesson.lessonSources,
          }),
        );
      } catch (error) {
        return mapDataServiceError(c, error);
      }
    },
  );

  return app;
}

function mapDataServiceError(c: Parameters<typeof problem>[0], error: unknown) {
  if (!(error instanceof DataServiceError)) {
    return problem(
      c,
      502,
      "data_service_unavailable",
      "The Data Service is unavailable.",
    );
  }

  const knownStatus =
    error.status === 404 &&
    [
      "lesson_not_found",
      "lesson_text_not_found",
      "media_asset_not_found",
      "source_not_found",
    ].includes(error.details.code)
      ? 404
      : error.status === 409 &&
          [
            "lesson_not_editable",
            "lesson_lifecycle_conflict",
            "lesson_text_not_found",
            "lesson_version_conflict",
            "published_lesson_conflict",
            "lesson_archived",
            "media_asset_not_pending",
            "media_asset_failed",
            "source_url_conflict",
          ].includes(error.details.code)
        ? 409
        : error.status === 422 &&
            [
              "invalid_lesson_id",
              "invalid_source_id",
              "unsupported_language",
              "validation_failed",
            ].includes(error.details.code)
          ? 422
          : undefined;
  if (knownStatus) {
    return problem(
      c,
      knownStatus,
      error.details.code,
      error.details.detail,
      error.details.errors,
    );
  }
  if (error.status === 504) {
    return problem(
      c,
      504,
      "data_service_timeout",
      "The Data Service timed out.",
    );
  }
  return problem(
    c,
    502,
    "data_service_unavailable",
    "The Data Service is unavailable.",
  );
}

function storageFailureProblem(
  c: Parameters<typeof problem>[0],
  error: unknown,
) {
  const name = storageErrorName(error);
  if (["NoSuchKey", "NotFound", "NoSuchObject"].includes(name)) {
    return problem(
      c,
      409,
      "upload_incomplete",
      "Uploaded object is not available yet.",
    );
  }
  if (["TimeoutError", "RequestTimeout", "ETIMEDOUT"].includes(name)) {
    return problem(c, 504, "storage_timeout", "Storage timed out.");
  }
  return problem(c, 503, "storage_unavailable", "Storage is unavailable.");
}

function logStorageFailure(
  requestId: string,
  operation: "inspect" | "delete",
  mediaAssetId: number,
  error: unknown,
) {
  console.log(
    JSON.stringify({
      requestId,
      operation,
      mediaAssetId,
      storageErrorCode: storageErrorName(error),
      storageRequestId: storageRequestId(error),
    }),
  );
}

function storageErrorName(error: unknown) {
  return error &&
    typeof error === "object" &&
    "name" in error &&
    typeof error.name === "string"
    ? error.name
    : "unknown";
}

function storageRequestId(error: unknown) {
  if (!error || typeof error !== "object" || !("$metadata" in error)) {
    return undefined;
  }
  const metadata = error.$metadata;
  return metadata &&
    typeof metadata === "object" &&
    "requestId" in metadata &&
    typeof metadata.requestId === "string"
    ? metadata.requestId
    : undefined;
}
