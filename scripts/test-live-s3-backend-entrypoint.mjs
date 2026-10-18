import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/app/package.json");
const { serve } = require("@hono/node-server");
const [
  { readinessResponseSchema },
  { createDataModule },
  { createBackendApp },
  { readBackendConfig },
  { createS3Storage },
] = await Promise.all([
  import(require.resolve("@ez-dk-citizen/api-contracts")),
  import(require.resolve("@ez-dk-citizen/data")),
  import("/app/dist/app.js"),
  import("/app/dist/config.js"),
  import("/app/dist/storage.js"),
]);

const config = readBackendConfig();
const app = createBackendApp(
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
    objectKeyGenerator() {
      const key = `smoke/${randomUUID()}.mp3`;
      appendFileSync("/tmp/ez-dk-citizen-live-s3-smoke-keys", `${key}\n`);
      return key;
    },
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
    hostname: "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
  },
  (info) => console.log(`Server is running on port ${info.port}.`),
);
