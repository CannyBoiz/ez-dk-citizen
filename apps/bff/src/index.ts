import { readinessResponseSchema } from "@ez-dk-citizen/api-contracts";
import { serve } from "@hono/node-server";

import { createBffApp } from "./app.js";
import { createDataServiceClient } from "./data-service-client.js";
import { createS3Storage } from "./storage.js";

if (!process.env.DATA_SERVICE_URL) {
  throw new Error("DATA_SERVICE_URL is required.");
}
const adminApiToken = process.env.ADMIN_API_TOKEN;
if (!adminApiToken) {
  throw new Error("ADMIN_API_TOKEN is required.");
}
const dataServiceToken = process.env.DATA_SERVICE_TOKEN;
if (!dataServiceToken) {
  throw new Error("DATA_SERVICE_TOKEN is required.");
}
if (adminApiToken === dataServiceToken) {
  throw new Error("ADMIN_API_TOKEN and DATA_SERVICE_TOKEN must differ.");
}
const awsRegion = process.env.AWS_REGION;
if (!awsRegion) throw new Error("AWS_REGION is required.");
const s3Bucket = process.env.S3_BUCKET;
if (!s3Bucket) throw new Error("S3_BUCKET is required.");
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
if (!awsAccessKeyId) throw new Error("AWS_ACCESS_KEY_ID is required.");
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
if (!awsSecretAccessKey) throw new Error("AWS_SECRET_ACCESS_KEY is required.");

const dataServiceUrl = new URL(process.env.DATA_SERVICE_URL);
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
    adminApiToken,
    adminOrigins: (process.env.ADMIN_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    dataServiceClient: createDataServiceClient(
      dataServiceUrl.toString(),
      dataServiceToken,
      dataServiceTimeoutMs,
    ),
    storageBucket: s3Bucket,
    storage: createS3Storage({
      region: awsRegion,
      bucket: s3Bucket,
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
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
