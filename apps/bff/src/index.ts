import { readinessResponseSchema } from "@ez-dk-citizen/api-contracts";
import { serve } from "@hono/node-server";

import { createBffApp } from "./app.js";
import { createDataServiceClient } from "./data-service-client.js";

if (!process.env.DATA_SERVICE_URL) {
  throw new Error("DATA_SERVICE_URL is required.");
}
if (!process.env.ADMIN_API_TOKEN) {
  throw new Error("ADMIN_API_TOKEN is required.");
}
if (!process.env.DATA_SERVICE_TOKEN) {
  throw new Error("DATA_SERVICE_TOKEN is required.");
}

const dataServiceUrl = new URL(process.env.DATA_SERVICE_URL);
const dataServiceToken = process.env.DATA_SERVICE_TOKEN;
const dataServiceTimeoutMs = Number(
  process.env.DATA_SERVICE_TIMEOUT_MS ?? 2000,
);
const app = createBffApp(
  async () => {
    const response = await fetch(new URL("/ready", dataServiceUrl), {
      signal: AbortSignal.timeout(
        Number(process.env.DATA_SERVICE_TIMEOUT_MS ?? 2000),
      ),
    });
    const readiness = readinessResponseSchema.parse(await response.json());

    if (!response.ok || readiness.status !== "ok") {
      throw new Error("Data Service is unavailable.");
    }
  },
  {
    adminApiToken: process.env.ADMIN_API_TOKEN,
    adminOrigins: (process.env.ADMIN_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    dataServiceClient: createDataServiceClient(
      dataServiceUrl.toString(),
      dataServiceToken,
      dataServiceTimeoutMs,
    ),
  },
);

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3000),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
