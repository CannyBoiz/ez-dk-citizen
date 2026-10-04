import {
  installRequestLifecycle,
  problem,
  requireBearerToken,
  type RequestIdEnvironment,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import type { DataDatabase } from "./db/database.js";
import { installProblemDetails } from "./errors/problem-details.js";
import { createLessonRoutes } from "./features/lessons/routes.js";
import { createMediaAssetRoutes } from "./features/media-assets/routes.js";
import { createSourceRoutes } from "./features/sources/routes.js";
import { createHealthRoutes } from "./routes/health.js";

export interface DataAppOptions {
  database?: DataDatabase;
  dataServiceToken?: string;
}

export function createDataApp(
  checkDatabaseReadiness: () => Promise<void>,
  options: DataAppOptions = {},
) {
  const app = new Hono<RequestIdEnvironment>();

  installRequestLifecycle(app);
  installProblemDetails(app);

  app.use("/internal/*", requireBearerToken(options.dataServiceToken));
  app.use(
    "/internal/*",
    bodyLimit({
      maxSize: 1024 * 1024,
      onError: (c) =>
        problem(c, 422, "body_too_large", "Request body exceeds 1 MiB."),
    }),
  );

  return app
    .route("/", createHealthRoutes(checkDatabaseReadiness))
    .route("/internal/media-assets", createMediaAssetRoutes(options.database))
    .route("/internal/lessons", createLessonRoutes(options.database))
    .route("/internal/sources", createSourceRoutes(options.database));
}
