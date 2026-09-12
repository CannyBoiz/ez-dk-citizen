import { readinessResponseSchema } from "@ez-dk-citizen/api-contracts";
import { serve } from "@hono/node-server";

import { createBffApp } from "./app.js";

if (!process.env.DATA_SERVICE_URL) {
  throw new Error("DATA_SERVICE_URL is required.");
}

const dataServiceUrl = new URL(process.env.DATA_SERVICE_URL);
const app = createBffApp(async () => {
  const response = await fetch(new URL("/ready", dataServiceUrl), {
    signal: AbortSignal.timeout(
      Number(process.env.DATA_SERVICE_TIMEOUT_MS ?? 2000),
    ),
  });
  const readiness = readinessResponseSchema.parse(await response.json());

  if (!response.ok || readiness.status !== "ok") {
    throw new Error("Data Service is unavailable.");
  }
});

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3000),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
