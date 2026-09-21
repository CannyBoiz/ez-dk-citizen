import { readinessResponseSchema } from "@ez-dk-citizen/api-contracts";
import { serve } from "@hono/node-server";

import { createBffApp } from "./app.js";
import { readBffConfig } from "./config.js";
import { createDataServiceClient } from "./data-service-client.js";
import { createS3Storage } from "./storage.js";

const config = readBffConfig();
const app = createBffApp(
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
    dataServiceClient: createDataServiceClient(
      config.dataServiceUrl.toString(),
      config.dataServiceToken,
      config.dataServiceTimeoutMs,
    ),
    storageBucket: config.s3Bucket,
    storage: createS3Storage({
      region: config.awsRegion,
      bucket: config.s3Bucket,
    }),
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
