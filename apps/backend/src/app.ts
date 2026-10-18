import { readinessResponseSchema } from "@ez-dk-citizen/api-contracts";
import { createDataModule, type DataModule } from "@ez-dk-citizen/data";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { BackendConfig } from "./config.js";
import { installProblemDetails, problem } from "./errors/problem-details.js";
import { adminAuth } from "./middleware/admin-auth.js";
import { adminCors } from "./middleware/cors.js";
import { logging } from "./middleware/logging.js";
import {
  type RequestIdEnvironment,
  requestId,
} from "./middleware/request-id.js";
import { createAdminLessonAudioRoutes } from "./routes/admin/lesson-audio.js";
import { createAdminLessonSourceRoutes } from "./routes/admin/lesson-sources.js";
import { createAdminLessonRoutes } from "./routes/admin/lessons.js";
import { createAdminMediaRoutes } from "./routes/admin/media.js";
import { createAdminSourceRoutes } from "./routes/admin/sources.js";
import { createHealthRoutes } from "./routes/health.js";
import { createMobileLessonRoutes } from "./routes/mobile/lessons.js";
import { createS3Storage, type Storage } from "./storage.js";

export interface BackendAppOptions {
  adminApiToken?: string;
  adminOrigins?: string[];
  data?: DataModule;
  objectKeyGenerator?: () => string;
  storage?: Storage;
  storageBucket?: string;
}

export function createApp({ config }: { config: BackendConfig }) {
  return createBackendApp(
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
      data: createDataModule(config.databaseUrl, config.databaseTimeoutMs),
      storageBucket: config.s3Bucket,
      storage: createS3Storage({
        region: config.awsRegion,
        bucket: config.s3Bucket,
      }),
    },
  );
}

export function createBackendApp(
  checkDataServiceReadiness: () => Promise<void>,
  options: BackendAppOptions = {},
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

  const data = options.data ?? withoutDataModule;
  return app
    .route("/", createHealthRoutes(checkDataServiceReadiness))
    .route("/api/admin/media", createAdminMediaRoutes(data, options))
    .route("/api/admin/lessons", createAdminLessonRoutes(data, options))
    .route("/api/admin/sources", createAdminSourceRoutes(data))
    .route("/api/admin/lessons", createAdminLessonSourceRoutes(data))
    .route("/api/admin/lessons", createAdminLessonAudioRoutes(data, options))
    .route("/api/mobile/lessons", createMobileLessonRoutes(data, options));
}

// Without a data module every operation throws, so its routes answer 500 internal_error.
const withoutDataModule = new Proxy({} as DataModule, {
  get: () => () => Promise.reject(new Error("No data module is configured.")),
});
