import {
  createLessonRequestSchema,
  lessonDetailSchema,
  lessonListResponseSchema,
  livenessResponseSchema,
  readinessResponseSchema,
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
      allowMethods: ["GET", "POST", "OPTIONS"],
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

  if (error.status === 404 || error.status === 409 || error.status === 422) {
    return problem(
      c,
      error.status,
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
