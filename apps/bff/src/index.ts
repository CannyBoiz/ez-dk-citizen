import { readinessResponseSchema } from "@ez-dk-citizen/api-contracts";
import { serve } from "@hono/node-server";

import { createBffApp } from "./app.js";

const dataServiceUrl = process.env.DATA_SERVICE_URL ?? "http://127.0.0.1:3000";
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
    port: Number(process.env.PORT ?? process.argv[2] ?? 3000),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
