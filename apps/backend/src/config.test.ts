import assert from "node:assert/strict";
import { test } from "node:test";

import { readBackendConfig } from "./config.js";

const baseEnvironment = {
  DATA_SERVICE_URL: "http://data:3000",
  ADMIN_API_TOKEN: "admin-token",
  DATA_SERVICE_TOKEN: "data-token",
  AWS_REGION: "eu-north-1",
  S3_BUCKET: "citizenship-audio",
};

test("Backend accepts credential-free startup configuration", () => {
  assert.deepEqual(readBackendConfig(baseEnvironment), {
    dataServiceUrl: new URL("http://data:3000"),
    dataServiceTimeoutMs: 2000,
    adminApiToken: "admin-token",
    dataServiceToken: "data-token",
    awsRegion: "eu-north-1",
    s3Bucket: "citizenship-audio",
    adminOrigins: [],
  });
});

for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
  test(`Backend rejects ${name} when set without its pair`, () => {
    assert.throws(
      () => readBackendConfig({ ...baseEnvironment, [name]: "stale-key" }),
      new RegExp(`${name} must not be set`),
    );
  });
}
