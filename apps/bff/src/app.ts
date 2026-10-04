import { readinessResponseSchema } from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { BffConfig } from "./config.js";
import {
  createDataServiceClient,
  type DataServiceClient,
} from "./data-service/client.js";
import { installProblemDetails, problem } from "./errors/problem-details.js";
import { adminAuth } from "./middleware/admin-auth.js";
import { adminCors } from "./middleware/cors.js";
import { logging } from "./middleware/logging.js";
import {
  requestId,
  type RequestIdEnvironment,
} from "./middleware/request-id.js";
import { createAdminLessonSourceRoutes } from "./routes/admin/lesson-sources.js";
import { createAdminLessonRoutes } from "./routes/admin/lessons.js";
import { createAdminMediaRoutes } from "./routes/admin/media.js";
import { createAdminSourceRoutes } from "./routes/admin/sources.js";
import { createHealthRoutes } from "./routes/health.js";
import { createMobileLessonRoutes } from "./routes/mobile/lessons.js";
import { createS3Storage, type Storage } from "./storage.js";

export interface BffAppOptions {
  adminApiToken?: string;
  adminOrigins?: string[];
  dataServiceClient?: DataServiceClient;
  objectKeyGenerator?: () => string;
  storage?: Storage;
  storageBucket?: string;
}

export function createApp({
  config,
  dataClient = createDataServiceClient(
    config.dataServiceUrl.toString(),
    config.dataServiceToken,
    config.dataServiceTimeoutMs,
  ),
}: {
  config: BffConfig;
  dataClient?: DataServiceClient;
}) {
  return createBffApp(
    async () => {
      const response = await fetch(new URL("/ready", config.dataServiceUrl), {
        signal: AbortSignal.timeout(config.dataServiceTimeoutMs),
      });
      const readiness = readinessResponseSchema.parse(await response.json());

      if (!response.ok || readiness.status !== "ok") {
        throw new Error("Data Service is unavailable.");
      }
    },
    {
      adminApiToken: config.adminApiToken,
      adminOrigins: config.adminOrigins,
      dataServiceClient: dataClient,
      storageBucket: config.s3Bucket,
      storage: createS3Storage({
        region: config.awsRegion,
        bucket: config.s3Bucket,
      }),
    },
  );
}

export function createBffApp(
  checkDataServiceReadiness: () => Promise<void>,
  options: BffAppOptions = {},
) {
  const app = new Hono<RequestIdEnvironment>();

  app.use("*", requestId);
  app.use("*", logging);
  installProblemDetails(app);

  app.use("/api/admin/*", adminCors(options.adminOrigins));
  app.use("/api/admin/*", adminAuth(options.adminApiToken));
  app.use(
    "/api/admin/*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) =>
        problem(c, 422, "body_too_large", "Request body exceeds 1 MiB."),
    }),
  );

  return app
    .route("/", createHealthRoutes(checkDataServiceReadiness))
    .route("/api/admin/media", createAdminMediaRoutes(options))
    .route("/api/admin/lessons", createAdminLessonRoutes(options))
    .route("/api/admin/sources", createAdminSourceRoutes(options))
    .route("/api/admin/lessons", createAdminLessonSourceRoutes(options))
    .route("/api/mobile/lessons", createMobileLessonRoutes(options));
}
