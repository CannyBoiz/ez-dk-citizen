import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { createS3Storage } from "./storage.js";

test("playback retains its full hour after a cached credential ages", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2030, 0, 1) });
  await withProcessCredentials(async (issueCredentials) => {
    await issueCredentials("first-session", 120);
    const storage = createS3Storage({
      region: "eu-north-1",
      bucket: "test-bucket",
    });
    const key = "audio/123e4567-e89b-12d3-a456-426614174000.mp3";
    await storage.createPlaybackAuthorization(key);

    context.mock.timers.tick(80 * 60_000);
    await issueCredentials("fresh-session", 120);
    const result = await storage.createPlaybackAuthorization(key);
    const url = new URL(result.playbackUrl);
    assert.match(
      url.searchParams.get("X-Amz-Credential") ?? "",
      /^fresh-session\//,
    );
    assert.equal(url.searchParams.get("X-Amz-Expires"), "3600");
    assert.equal(result.expiresAt, "2030-01-01T02:20:00.000Z");
  });
});

test("upload retains all fifteen minutes after a cached credential ages", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: Date.UTC(2030, 0, 1) });
  await withProcessCredentials(async (issueCredentials) => {
    await issueCredentials("first-session", 120);
    const storage = createS3Storage({
      region: "eu-north-1",
      bucket: "test-bucket",
    });
    const input = {
      key: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
      contentType: "audio/mpeg" as const,
      sizeBytes: 1,
    };
    await storage.createUploadAuthorization(input);
    context.mock.timers.tick(110 * 60_000);
    await issueCredentials("fresh-session", 120);
    const result = await storage.createUploadAuthorization(input);
    const url = new URL(result.uploadUrl);
    assert.match(
      url.searchParams.get("X-Amz-Credential") ?? "",
      /^fresh-session\//,
    );
    assert.equal(url.searchParams.get("X-Amz-Expires"), "900");
    assert.equal(result.expiresAt, "2030-01-01T02:05:00.000Z");
  });
});

test("signing refuses temporary credentials that cannot cover the promised expiry", async () => {
  await withProcessCredentials(async (issueCredentials) => {
    const storage = createS3Storage({
      region: "eu-north-1",
      bucket: "test-bucket",
    });
    const key = "audio/123e4567-e89b-12d3-a456-426614174000.mp3";
    await issueCredentials("short-session", 40);
    await assert.rejects(storage.createPlaybackAuthorization(key), {
      name: "CredentialLifetimeError",
    });
    await issueCredentials("short-session", 10);
    await assert.rejects(
      storage.createUploadAuthorization({
        key,
        contentType: "audio/mpeg",
        sizeBytes: 1,
      }),
      { name: "CredentialLifetimeError" },
    );
    await issueCredentials("unknown-expiry", undefined);
    await assert.rejects(storage.createPlaybackAuthorization(key), {
      name: "CredentialLifetimeError",
    });
  });
});

async function withProcessCredentials(
  run: (
    issueCredentials: (
      accessKeyId: string,
      minutes: number | undefined,
    ) => Promise<void>,
  ) => Promise<void>,
) {
  const directory = await mkdtemp(path.join(tmpdir(), "s3-signing-test-"));
  const credentialsFile = path.join(directory, "credentials.json");
  const processFile = path.join(directory, "provider.cjs");
  const configFile = path.join(directory, "config");
  const emptyFile = path.join(directory, "empty");
  const environment = {
    AWS_CONFIG_FILE: configFile,
    AWS_SHARED_CREDENTIALS_FILE: emptyFile,
    AWS_PROFILE: "signing-test",
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_ACCESS_KEY_ID: undefined,
    AWS_SECRET_ACCESS_KEY: undefined,
    AWS_SESSION_TOKEN: undefined,
  };
  const previous = Object.fromEntries(
    Object.keys(environment).map((name) => [name, process.env[name]]),
  );
  try {
    await writeFile(
      processFile,
      'process.stdout.write(require("node:fs").readFileSync(process.argv[2], "utf8"));',
    );
    await writeFile(emptyFile, "");
    await writeFile(
      configFile,
      `[profile signing-test]\ncredential_process = "${process.execPath}" "${processFile}" "${credentialsFile}"\n`,
    );
    for (const [name, value] of Object.entries(environment))
      restoreEnvironment(name, value);
    await run(async (accessKeyId, minutes) => {
      await writeFile(
        credentialsFile,
        JSON.stringify({
          Version: 1,
          AccessKeyId: accessKeyId,
          SecretAccessKey: "test-secret",
          SessionToken: "test-session-token",
          Expiration:
            minutes === undefined
              ? undefined
              : new Date(Date.now() + minutes * 60_000).toISOString(),
        }),
      );
    });
  } finally {
    for (const [name, value] of Object.entries(previous))
      restoreEnvironment(name, value);
    await rm(directory, { recursive: true, force: true });
  }
}

test("S3 upload authorization uses the standard credential chain", async () => {
  await withTestCredentials(async () => {
    const authorization = await createS3Storage({
      region: "eu-north-1",
      bucket: "citizenship-audio",
    }).createUploadAuthorization({
      key: "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
      contentType: "audio/mpeg",
      sizeBytes: 1,
    });

    assert.match(
      new URL(authorization.uploadUrl).searchParams.get("X-Amz-Credential") ??
        "",
      /^test-access-key-id\//,
    );
    assert.deepEqual(
      new URL(authorization.uploadUrl).searchParams
        .get("X-Amz-SignedHeaders")
        ?.split(";")
        .sort(),
      ["content-length", "content-type", "host", "if-none-match"],
    );
    assert.deepEqual(authorization.uploadHeaders, {
      "Content-Type": "audio/mpeg",
      "Content-Length": "1",
      "If-None-Match": "*",
    });
    assert.ok(
      Date.parse(authorization.expiresAt) > Date.now() + 14 * 60 * 1_000,
    );
  });
});

test("S3 playback authorization is a one-hour object read", async () => {
  await withTestCredentials(async () => {
    const authorization = await createS3Storage({
      region: "eu-north-1",
      bucket: "citizenship-audio",
    }).createPlaybackAuthorization(
      "audio/123e4567-e89b-12d3-a456-426614174000.mp3",
    );

    assert.equal(
      new URL(authorization.playbackUrl).searchParams.get("X-Amz-Expires"),
      "3600",
    );
    assert.ok(
      Date.parse(authorization.expiresAt) > Date.now() + 59 * 60 * 1_000,
    );
  });
});

async function withTestCredentials(run: () => Promise<void>) {
  const previous = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
  process.env.AWS_ACCESS_KEY_ID = "test-access-key-id";
  process.env.AWS_SECRET_ACCESS_KEY = "test-secret-access-key";
  try {
    await run();
  } finally {
    restoreEnvironment("AWS_ACCESS_KEY_ID", previous.accessKeyId);
    restoreEnvironment("AWS_SECRET_ACCESS_KEY", previous.secretAccessKey);
  }
}

function restoreEnvironment(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
