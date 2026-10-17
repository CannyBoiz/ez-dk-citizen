import assert from "node:assert/strict";
import { test } from "node:test";

import { readBackendConfig } from "./config.js";

const baseEnvironment = {
  DATABASE_URL: "postgresql://backend:password@postgres:5432/ez_dk_citizen",
  DATA_SERVICE_URL: "http://data:3000",
  ADMIN_API_TOKEN: "admin-token",
  DATA_SERVICE_TOKEN: "data-token",
  AWS_REGION: "eu-north-1",
  S3_BUCKET: "citizenship-audio",
};

test("Backend accepts credential-free startup configuration", () => {
  assert.deepEqual(readBackendConfig(baseEnvironment), {
    databaseUrl: "postgresql://backend:password@postgres:5432/ez_dk_citizen",
    databaseTimeoutMs: 2000,
    dataServiceUrl: new URL("http://data:3000"),
    dataServiceTimeoutMs: 2000,
    adminApiToken: "admin-token",
    dataServiceToken: "data-token",
    awsRegion: "eu-north-1",
    s3Bucket: "citizenship-audio",
    adminOrigins: [],
  });
});

test("Backend refuses a database timeout that would not bound anything", () => {
  for (const value of ["0", "", "soon", "1.5"]) {
    assert.throws(
      () =>
        readBackendConfig({ ...baseEnvironment, DATABASE_TIMEOUT_MS: value }),
      /DATABASE_TIMEOUT_MS must be a positive whole number/,
    );
  }
});

for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
  test(`Backend rejects ${name} when set without its pair`, () => {
    assert.throws(
      () => readBackendConfig({ ...baseEnvironment, [name]: "stale-key" }),
      new RegExp(`${name} must not be set`),
    );
  });
}
