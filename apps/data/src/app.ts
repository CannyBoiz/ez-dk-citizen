import {
  installRequestLifecycle,
  problem,
  type RequestIdEnvironment,
  requireBearerToken,
} from "@ez-dk-citizen/api-contracts";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import {
  createDataOperations,
  type DataOperations,
} from "./data-operations.js";
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
  const data = options.database
    ? createDataOperations(options.database)
    : withoutDatabase;
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
    .route("/internal/media-assets", createMediaAssetRoutes(data))
    .route("/internal/lessons", createLessonRoutes(data))
    .route("/internal/sources", createSourceRoutes(data));
}

// Without a database every operation throws, so the app answers 500 internal_error.
const withoutDatabase = new Proxy({} as DataOperations, {
  get: () => () => Promise.reject(new Error("No database is configured.")),
});
