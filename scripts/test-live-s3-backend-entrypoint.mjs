import { randomUUID } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire("/app/package.json");
const { serve } = require("@hono/node-server");
const [
  { createDataModule },
  { createBackendApp },
  { readBackendConfig },
  { createS3Storage },
] = await Promise.all([
  import(require.resolve("@ez-dk-citizen/data")),
  import("/app/dist/app.js"),
  import("/app/dist/config.js"),
  import("/app/dist/storage.js"),
]);

const config = readBackendConfig();
const data = createDataModule(config.databaseUrl, config.databaseTimeoutMs);
const app = createBackendApp(() => data.checkReadiness(), {
  adminApiToken: config.adminApiToken,
  adminOrigins: config.adminOrigins,
  data,
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
});

serve(
  {
    fetch: app.fetch,
    hostname: "0.0.0.0",
    port: Number(process.env.PORT ?? 3000),
  },
  (info) => console.log(`Server is running on port ${info.port}.`),
);
