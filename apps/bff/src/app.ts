import {
  createSourceRequestSchema,
  createLessonRequestSchema,
  lessonDetailSchema,
  lessonListResponseSchema,
  mobileLessonDetailSchema,
  mobileLessonListResponseSchema,
  livenessResponseSchema,
  patchLessonRequestSchema,
  readinessResponseSchema,
  sourceListResponseSchema,
  sourceResponseSchema,
  upsertLessonSourceRequestSchema,
  upsertLessonTextRequestSchema,
} from "@ez-dk-citizen/api-contracts";
import { cors } from "hono/cors";
import { Hono } from "hono";

import {
  DataServiceError,
  type DataServiceClient,
} from "./data-service-client.js";
import {
  type BffAppEnvironment,
  installRequestLifecycle,
  parseJsonBody,
  parsePositiveId,
  problem,
  requireBearerToken,
} from "./http.js";

export interface BffAppOptions {
  adminApiToken?: string;
  adminOrigins?: string[];
  dataServiceClient?: DataServiceClient;
}

export function createBffApp(
  checkDataServiceReadiness: () => Promise<void>,
  options: BffAppOptions = {},
) {
  const app = new Hono<BffAppEnvironment>();

  installRequestLifecycle(app);
  app.onError((_error, c) => {
    return problem(
      c,
      500,
      "internal_error",
      "The request could not be completed.",
    );
  });

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

  app.post("/api/admin/lessons", async (c) => {
    const parsed = await parseJsonBody(c, createLessonRequestSchema);
    if ("response" in parsed) return parsed.response;
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
        parsed.value,
        c.get("requestId"),
      );
      c.header("Location", `/api/admin/lessons/${detail.id}`);
      return c.json(lessonDetailSchema.parse(detail), 201);
    } catch (error) {
      return mapDataServiceError(c, error);
    }
  });

  app.post("/api/admin/sources", async (c) => {
    const parsed = await parseJsonBody(c, createSourceRequestSchema);
    if ("response" in parsed) return parsed.response;
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
        parsed.value,
        c.get("requestId"),
      );
      c.header("Location", `/api/admin/sources/${source.id}`);
      return c.json(sourceResponseSchema.parse(source), 201);
    } catch (error) {
      return mapDataServiceError(c, error);
    }
  });

  app.patch("/api/admin/lessons/:lessonId", async (c) => {
    const id = parsePositiveId(c.req.param("lessonId"));
    if (!id)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
    const parsed = await parseJsonBody(c, patchLessonRequestSchema);
    if ("response" in parsed) return parsed.response;
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
            parsed.value,
            c.get("requestId"),
          ),
        ),
      );
    } catch (error) {
      return mapDataServiceError(c, error);
    }
  });

  app.put("/api/admin/lessons/:lessonId/texts/:languageCode", async (c) => {
    const id = parsePositiveId(c.req.param("lessonId"));
    if (!id)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
    const parsed = await parseJsonBody(c, upsertLessonTextRequestSchema);
    if ("response" in parsed) return parsed.response;
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
            c.req.param("languageCode"),
            parsed.value,
            c.get("requestId"),
          ),
        ),
      );
    } catch (error) {
      return mapDataServiceError(c, error);
    }
  });

  app.put("/api/admin/lessons/:lessonId/sources/:sourceId", async (c) => {
    const lessonId = parsePositiveId(c.req.param("lessonId"));
    if (!lessonId)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
    const sourceId = parsePositiveId(c.req.param("sourceId"));
    if (!sourceId)
      return problem(
        c,
        422,
        "invalid_source_id",
        "Source ID must be a positive integer.",
      );
    const parsed = await parseJsonBody(c, upsertLessonSourceRequestSchema);
    if ("response" in parsed) return parsed.response;
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
            parsed.value,
            c.get("requestId"),
          ),
        ),
      );
    } catch (error) {
      return mapDataServiceError(c, error);
    }
  });

  app.delete("/api/admin/lessons/:lessonId/sources/:sourceId", async (c) => {
    const lessonId = parsePositiveId(c.req.param("lessonId"));
    if (!lessonId)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
    const sourceId = parsePositiveId(c.req.param("sourceId"));
    if (!sourceId)
      return problem(
        c,
        422,
        "invalid_source_id",
        "Source ID must be a positive integer.",
      );
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
  });

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

  app.get("/api/admin/lessons/:lessonId", async (c) => {
    const id = parsePositiveId(c.req.param("lessonId"));
    if (!id)
      return problem(
        c,
        422,
        "invalid_lesson_id",
        "Lesson ID must be a positive integer.",
      );
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
  });

  app.get("/api/mobile/lessons", async (c) => {
    const languageCode = c.req.query("language") ?? "th";
    if (!languageCode) return problem(c, 422, "unsupported_language", "Language is not supported.");
    if (!options.dataServiceClient) return problem(c, 502, "data_service_unavailable", "The Data Service is unavailable.");
    try {
      return c.json(mobileLessonListResponseSchema.parse(
        await options.dataServiceClient.listPublishedLessons(languageCode, c.get("requestId")),
      ));
    } catch (error) {
      return mapDataServiceError(c, error);
    }
  });

  app.get("/api/mobile/lessons/:lessonId", async (c) => {
    const id = parsePositiveId(c.req.param("lessonId"));
    if (!id) return problem(c, 422, "invalid_lesson_id", "Lesson ID must be a positive integer.");
    const languageCode = c.req.query("language") ?? "th";
    if (!languageCode) return problem(c, 422, "unsupported_language", "Language is not supported.");
    if (!options.dataServiceClient) return problem(c, 502, "data_service_unavailable", "The Data Service is unavailable.");
    try {
      return c.json(mobileLessonDetailSchema.parse(
        await options.dataServiceClient.getPublishedLesson(id, languageCode, c.get("requestId")),
      ));
    } catch (error) {
      return mapDataServiceError(c, error);
    }
  });

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
    ["lesson_not_found", "lesson_text_not_found", "source_not_found"].includes(error.details.code)
      ? 404
      : error.status === 409 &&
          [
            "lesson_not_editable",
            "lesson_lifecycle_conflict",
            "lesson_version_conflict",
            "published_lesson_conflict",
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
