import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const origin = "http://127.0.0.1:5173";
const rejectedOrigin = "http://127.0.0.1:5174";
const image = "ez-dk-citizen-bff:local";
const requiredEnvironment = [
  "ADMIN_API_TOKEN",
  "AWS_REGION",
  "DATA_SERVICE_TOKEN",
  "S3_BUCKET",
];
const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(`Live S3 tracer requires ${missing.join(", ")}.`);
}
if (process.env.ADMIN_API_TOKEN === process.env.DATA_SERVICE_TOKEN) {
  throw new Error("ADMIN_API_TOKEN and DATA_SERVICE_TOKEN must differ.");
}

const logFiles = (process.env.LIVE_S3_TRACER_LOG_FILES ?? "")
  .split(",")
  .map((file) => file.trim())
  .filter(Boolean);
await Promise.all(logFiles.map((file) => readFile(file, "utf8")));

const environment = { ...process.env };
for (const name of [
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
]) {
  delete environment[name];
}
const browserEnvironment = { ...environment };
for (const name of [
  "ADMIN_API_TOKEN",
  "DATA_SERVICE_TOKEN",
  "DATA_SERVICE_URL",
  "S3_BUCKET",
  ...Object.keys(browserEnvironment).filter((name) => name.startsWith("AWS_")),
]) {
  delete browserEnvironment[name];
}

const browser = findBrowser();
if (!browser) {
  throw new Error(
    "A Chromium-family browser is required. Set BROWSER to its executable path.",
  );
}

const configFile = runtimeFile("AWS_ROLES_ANYWHERE_CONFIG_FILE", "config");
const certificateFile = runtimeFile(
  "AWS_ROLES_ANYWHERE_CERTIFICATE_FILE",
  "workload.crt",
);
const privateKeyFile = runtimeFile(
  "AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE",
  "workload.key",
);
await Promise.all(
  [configFile, certificateFile, privateKeyFile].map(requireFile),
);
const privateKeyStat = await stat(privateKeyFile);
assert.equal(
  privateKeyStat.mode & 0o777,
  0o600,
  `Roles Anywhere private key must have mode 0600: ${privateKeyFile}`,
);

const projectName = `ez-dk-live-s3-${process.pid}-${Date.now().toString(36)}`;
const containerName = `${projectName}-bff`;
const composeEnvironment = {
  ...environment,
  ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN,
  ADMIN_ORIGINS: origin,
  AWS_REGION: process.env.AWS_REGION,
  DATA_SERVICE_TOKEN: process.env.DATA_SERVICE_TOKEN,
  POSTGRES_DB: `live_s3_${process.pid}`,
  POSTGRES_USER: `live_s3_${process.pid}`,
  POSTGRES_PASSWORD: `live-s3-${randomSuffix()}`,
  S3_BUCKET: process.env.S3_BUCKET,
  AWS_ROLES_ANYWHERE_CONFIG_FILE: configFile,
  AWS_ROLES_ANYWHERE_CERTIFICATE_FILE: certificateFile,
  AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE: privateKeyFile,
};

const composeArguments = [
  "compose",
  "--env-file",
  "/dev/null",
  "--file",
  path.join(repositoryRoot, "docker-compose.yml"),
  "--file",
  path.join(repositoryRoot, "docker-compose.roles-anywhere.yml"),
  "--project-name",
  projectName,
];
const composeConfig = JSON.parse(
  (
    await runDocker([...composeArguments, "config", "--format", "json"], {
      captureOutput: true,
    })
  ).output,
);
assertComposeTopology(composeConfig);

if (process.argv.includes("--preflight")) {
  console.log(
    "Live S3 tracer preflight passed; no containers or S3 objects created.",
  );
  process.exit(0);
}

const smokeKeyFileDirectory = await mkdtemp(
  path.join(tmpdir(), "ez-dk-live-s3-"),
);
const smokeKeyFile = path.join(smokeKeyFileDirectory, "smoke-keys");
await writeFile(smokeKeyFile, "", { mode: 0o600 });
const entrypointFile = path.join(
  repositoryRoot,
  "scripts/test-live-s3-bff-entrypoint.mjs",
);
const bytes = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0]);
const languageCode = process.env.LIVE_S3_TRACER_LANGUAGE_CODE ?? "th";
const sensitiveValues = [
  { name: "admin bearer token", value: process.env.ADMIN_API_TOKEN },
  { name: "Data Service bearer token", value: process.env.DATA_SERVICE_TOKEN },
];
let currentUploadUrl;
const cleanupFailures = [];
const failedKeys = [];
let tracerFailure;
let cleanupUnverified = false;
let bffContainerStarted = false;
let browserProfile;
let bffServer;
let allowedServer;
let rejectedServer;
let port;
let tracerPhase = "initializing";

try {
  port = await availablePort();
  allowedServer = await startPageServer(5173, () => currentUploadUrl);
  rejectedServer = await startPageServer(5174, () => currentUploadUrl);

  tracerPhase = "building the BFF image";
  await runDocker([...composeArguments, "build", "bff"]);
  tracerPhase = "inspecting the BFF image";
  await assertImageContents();
  tracerPhase = "starting the isolated Data Service";
  await runDocker([
    ...composeArguments,
    "up",
    "--detach",
    "--build",
    "--wait",
    "--wait-timeout",
    "120",
    "hono-data",
  ]);
  bffContainerStarted = true;
  tracerPhase = "starting the test BFF container";
  await runDocker([
    ...composeArguments,
    "run",
    "--detach",
    "--no-deps",
    "--name",
    containerName,
    "--publish",
    `127.0.0.1:${port}:3000`,
    "--volume",
    `${entrypointFile}:/tmp/test-live-s3-bff-entrypoint.mjs:ro`,
    "--volume",
    `${smokeKeyFile}:/tmp/ez-dk-citizen-live-s3-smoke-keys:rw`,
    "bff",
    "node",
    "/tmp/test-live-s3-bff-entrypoint.mjs",
  ]);
  tracerPhase = "inspecting the test BFF container";
  await assertRunningContainer();
  tracerPhase = "checking the workload key mount";
  await assertPrivateKeyReadable();
  tracerPhase = "verifying the Roles Anywhere identity";
  await assertRoleIdentity();
  bffServer = `http://127.0.0.1:${port}`;
  tracerPhase = "waiting for BFF readiness";
  await waitForBff(bffServer);
  browserProfile = await mkdtemp(path.join(tmpdir(), "ez-dk-s3-browser-"));

  tracerPhase = "exercising the live upload and playback flow";
  const lesson = await requestBff(bffServer, "/api/admin/lessons", "POST", {
    chapter: 1,
    version: 1,
  });
  assert.equal(lesson.response.status, 201, "Tracer Lesson was not created.");
  const lessonId = lesson.body.id;
  const textBody = {
    title: "Live S3 tracer",
    content: "Temporary lesson used by the opt-in live S3 tracer.",
  };
  const text = await requestBff(
    bffServer,
    `/api/admin/lessons/${lessonId}/texts/${languageCode}`,
    "PUT",
    textBody,
  );
  assert.equal(text.response.status, 200, "Tracer Lesson Text was not saved.");
  const published = await requestBff(
    bffServer,
    `/api/admin/lessons/${lessonId}`,
    "PATCH",
    { status: "PUBLISHED" },
  );
  assert.equal(
    published.response.status,
    200,
    "Tracer Lesson was not published.",
  );

  const uploadBody = {
    lessonId,
    languageCode,
    originalFilename: "smoke.mp3",
    contentType: "audio/mpeg",
    sizeBytes: bytes.byteLength,
  };
  const intent = await requestBff(
    bffServer,
    "/api/admin/media/upload-intents",
    "POST",
    uploadBody,
  );
  assert.equal(intent.response.status, 201, "Upload Intent was not created.");
  assert.deepEqual(Object.keys(intent.body).sort(), [
    "expiresAt",
    "mediaAssetId",
    "uploadHeaders",
    "uploadUrl",
  ]);
  assert.deepEqual(intent.body.uploadHeaders, {
    "Content-Length": String(bytes.byteLength),
    "Content-Type": "audio/mpeg",
    "If-None-Match": "*",
  });
  sensitiveValues.push({
    name: "complete upload URL",
    value: intent.body.uploadUrl,
  });
  currentUploadUrl = intent.body.uploadUrl;
  const smokeKeys = await readSmokeKeys();
  smokeKeys.forEach(assertSmokeKey);
  assert.equal(smokeKeys.length, 1, "Tracer did not create one smoke key.");

  await expectBrowserResult(
    browser,
    browserProfile,
    `${rejectedOrigin}/?mode=disallowed`,
    "rejected",
  );
  await expectBrowserResult(
    browser,
    browserProfile,
    `${origin}/?mode=unapproved`,
    "rejected",
  );
  for (const mode of [
    "wrong-content-type",
    "wrong-length",
    "missing-condition",
  ]) {
    await expectBrowserResult(
      browser,
      browserProfile,
      `${origin}/?mode=${mode}`,
      "rejected",
      `S3 accepted the ${mode} Upload Intent request.`,
    );
  }
  await expectBrowserResult(
    browser,
    browserProfile,
    `${origin}/?mode=upload`,
    "uploaded",
    "Allowed Admin origin CORS preflight or direct PUT failed.",
  );
  await expectBrowserResult(
    browser,
    browserProfile,
    `${origin}/?mode=overwrite`,
    "rejected",
  );

  const completed = await requestBff(
    bffServer,
    `/api/admin/media/${intent.body.mediaAssetId}/complete`,
    "POST",
    { lessonId, languageCode },
  );
  assert.equal(
    completed.response.status,
    200,
    "Media Asset was not completed.",
  );
  assert.deepEqual(Object.keys(completed.body).sort(), [
    "lessonAudio",
    "mediaAsset",
  ]);
  assert.deepEqual(Object.keys(completed.body.mediaAsset).sort(), [
    "contentType",
    "durationMs",
    "id",
    "sizeBytes",
    "status",
    "uploadedAt",
  ]);
  assert.deepEqual(Object.keys(completed.body.lessonAudio).sort(), [
    "audioVersion",
    "createdAt",
    "id",
    "isCurrent",
    "languageCode",
    "lessonId",
  ]);

  const mobile = await fetch(
    `${bffServer}/api/mobile/lessons/${lessonId}?language=${encodeURIComponent(languageCode)}`,
  );
  assert.equal(mobile.status, 200, "Mobile Lesson was not returned.");
  const lessonResponse = await mobile.json();
  assert.equal(mobile.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(lessonResponse).sort(), [
    "audio",
    "availableLanguageCodes",
    "chapter",
    "content",
    "id",
    "languageCode",
    "lessonSources",
    "title",
    "version",
  ]);
  assert.deepEqual(Object.keys(lessonResponse.audio ?? {}).sort(), [
    "audioVersion",
    "contentType",
    "durationMs",
    "mediaAssetId",
    "playbackExpiresAt",
    "playbackUrl",
    "sizeBytes",
  ]);
  assert.equal("storageContainer" in lessonResponse.audio, false);
  assert.equal("objectKey" in lessonResponse.audio, false);
  assert.equal("bucket" in lessonResponse.audio, false);
  assertPublicResponse(lessonResponse, "Mobile Lesson");

  const playbackUrl = lessonResponse.audio.playbackUrl;
  sensitiveValues.push({ name: "complete playback URL", value: playbackUrl });
  const playback = await fetch(playbackUrl);
  assert.equal(playback.status, 200, "Playback URL did not fetch from S3.");
  assert.deepEqual(new Uint8Array(await playback.arrayBuffer()), bytes);

  const unsigned = new URL(intent.body.uploadUrl);
  unsigned.search = "";
  const publicObject = await fetch(unsigned);
  assert.equal(
    publicObject.ok,
    false,
    "Unsigned public object access succeeded.",
  );
} catch (error) {
  tracerFailure = new Error(
    `Live S3 tracer failed while ${tracerPhase}: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );
} finally {
  if (bffContainerStarted) {
    try {
      const smokeKeys = await readSmokeKeys();
      failedKeys.push(...smokeKeys);
      smokeKeys.forEach(assertSmokeKey);
      cleanupFailures.push(...(await deleteExactSmokeKeys(smokeKeys)));
    } catch {
      if (failedKeys.length) cleanupFailures.push(...failedKeys);
      else {
        cleanupUnverified = true;
        tracerFailure ??= new Error(
          `Could not verify exact-key S3 cleanup; inspect ${smokeKeyFile} before rerunning.`,
        );
      }
    }

    try {
      await assertSafeLogs(sensitiveValues);
    } catch (error) {
      tracerFailure ??= error;
    }
    try {
      await runDocker(["rm", "--force", containerName]);
    } catch {
      tracerFailure ??= new Error(
        "Could not remove the isolated BFF container.",
      );
    }
  }

  try {
    await runDocker([
      ...composeArguments,
      "down",
      "--volumes",
      "--remove-orphans",
    ]);
  } catch {
    tracerFailure ??= new Error(
      "Could not remove the isolated live-tracer stack.",
    );
  }
  await Promise.all([allowedServer, rejectedServer].filter(Boolean).map(close));
  if (browserProfile)
    await rm(browserProfile, { force: true, recursive: true });
}

if (cleanupFailures.length) {
  throw new Error(
    `Live S3 tracer cleanup failed for bucket ${process.env.S3_BUCKET}. Delete only these exact smoke keys manually: ${cleanupFailures.join(", ")}. Recorded keys remain in ${smokeKeyFile}.`,
  );
}
if (cleanupUnverified) {
  throw new Error(
    `Could not verify exact-key S3 cleanup. Recorded keys remain in ${smokeKeyFile}.`,
  );
}
await rm(smokeKeyFileDirectory, { force: true, recursive: true });
if (tracerFailure) throw tracerFailure;
console.log("Live browser-to-S3 Roles Anywhere tracer passed.");

function randomSuffix() {
  return `${process.pid}_${Date.now().toString(36)}`;
}

function runtimeFile(name, fallback) {
  return path.resolve(
    repositoryRoot,
    process.env[name] ?? path.join("runtime", "aws", fallback),
  );
}

async function requireFile(file) {
  await stat(file).catch(() => {
    throw new Error(`Roles Anywhere runtime file is missing: ${file}`);
  });
}

function assertComposeTopology(config) {
  const bff = config.services.bff;
  assert.equal(bff.environment.AWS_PROFILE, "roles-anywhere");
  assert.equal(
    bff.environment.AWS_CONFIG_FILE,
    "/run/ez-dk-citizen/aws/config",
  );
  assert.equal(bff.environment.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(bff.environment.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(bff.environment.ADMIN_ORIGINS, origin);

  const mounts = new Map(bff.volumes.map((volume) => [volume.target, volume]));
  assert.deepEqual([...mounts.keys()].sort(), [
    "/run/ez-dk-citizen/aws/config",
    "/run/ez-dk-citizen/identity/workload.crt",
    "/run/ez-dk-citizen/identity/workload.key",
  ]);
  for (const target of mounts.keys()) {
    assert.equal(
      mounts.get(target)?.read_only,
      true,
      `${target} is not read-only`,
    );
  }

  for (const name of ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"]) {
    assert.ok(config.services.postgres.environment[name]);
  }
}

async function assertImageContents() {
  for (const file of [certificateFile, privateKeyFile]) {
    const relativePath = path.relative(repositoryRoot, file);
    if (relativePath.startsWith("..")) continue;
    assert.notEqual(
      spawnSync("git", ["ls-files", "--error-unmatch", relativePath], {
        cwd: repositoryRoot,
        env: environment,
        stdio: "ignore",
      }).status,
      0,
      `Workload identity file is tracked: ${relativePath}`,
    );
    assert.equal(
      spawnSync("git", ["check-ignore", relativePath], {
        cwd: repositoryRoot,
        env: environment,
        stdio: "ignore",
      }).status,
      0,
      `Workload identity file is not Git-ignored: ${relativePath}`,
    );
  }
  const inspected = JSON.parse(
    (await runDocker(["image", "inspect", image], { captureOutput: true }))
      .output,
  )[0];
  assert.equal(inspected.Config.User, "node");
  assert.equal(
    inspected.Config.Env.some((value) =>
      /AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=/.test(value),
    ),
    false,
  );
  await runDocker([
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    image,
    "-ec",
    "test -x /usr/local/bin/aws_signing_helper; test ! -e /run/ez-dk-citizen/aws/config; test ! -e /run/ez-dk-citizen/identity/workload.crt; test ! -e /run/ez-dk-citizen/identity/workload.key; test ! -e /run/ez-dk-citizen/identity/ca.key; test ! -e /app/runtime; test ! -e /app/extra-files",
  ]);
}

async function assertRunningContainer() {
  const inspected = JSON.parse(
    (await runDocker(["inspect", containerName], { captureOutput: true }))
      .output,
  )[0];
  assert.equal(inspected.Config.User, "node");
  const environment = Object.fromEntries(
    inspected.Config.Env.map((value) => {
      const separator = value.indexOf("=");
      return [value.slice(0, separator), value.slice(separator + 1)];
    }),
  );
  assert.equal(environment.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(environment.AWS_SECRET_ACCESS_KEY, undefined);
  assert.equal(environment.AWS_PROFILE, "roles-anywhere");
  assert.equal(environment.AWS_CONFIG_FILE, "/run/ez-dk-citizen/aws/config");
  const mounts = new Map(
    inspected.Mounts.map((mount) => [mount.Destination, mount]),
  );
  for (const target of [
    "/run/ez-dk-citizen/aws/config",
    "/run/ez-dk-citizen/identity/workload.crt",
    "/run/ez-dk-citizen/identity/workload.key",
  ]) {
    assert.equal(mounts.get(target)?.RW, false, `${target} is not read-only`);
  }
  assert.equal(mounts.get("/tmp/test-live-s3-bff-entrypoint.mjs")?.RW, false);
  assert.equal(mounts.get("/tmp/ez-dk-citizen-live-s3-smoke-keys")?.RW, true);
}

async function assertPrivateKeyReadable() {
  await runDocker([
    "exec",
    containerName,
    "node",
    "--input-type=module",
    "-e",
    'import { accessSync, constants } from "node:fs"; accessSync("/run/ez-dk-citizen/identity/workload.key", constants.R_OK);',
  ]);
}

async function assertRoleIdentity() {
  const output = await runDocker(
    [
      "exec",
      containerName,
      "node",
      "--input-type=module",
      "-e",
      'import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts"; const identity = await new STSClient({}).send(new GetCallerIdentityCommand({})); console.log(JSON.stringify({ Account: identity.Account, Arn: identity.Arn, UserId: identity.UserId }));',
    ],
    { captureOutput: true },
  );
  const identity = JSON.parse(output.output.trim());
  if (
    !/^arn:aws:sts::\d+:assumed-role\/ez-dk-citizen-role-anywhere-s3\//.test(
      identity.Arn,
    )
  ) {
    throw new Error(
      `Expected ez-dk-citizen-role-anywhere-s3, received ${identity.Arn ?? "no ARN"}.`,
    );
  }
  console.log(
    `AWS identity verified: ${identity.Arn} (account ${identity.Account}).`,
  );
}

async function waitForBff(baseUrl) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/ready`, {
        signal: AbortSignal.timeout(2_000),
      });
      if (response.ok && (await response.json()).status === "ok") return;
    } catch {
      // The container can need a moment to bind its published port.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error("The containerized BFF did not become ready.");
}

async function requestBff(baseUrl, endpoint, method, body) {
  const bodyText = JSON.stringify(body);
  sensitiveValues.push({ name: "request body", value: bodyText });
  for (const [key, value] of Object.entries(body)) {
    sensitiveValues.push({
      name: `request body field ${key}`,
      pattern: `${RegExp.escape(JSON.stringify(key))}\\s*:\\s*${RegExp.escape(JSON.stringify(value))}`,
    });
    if (
      typeof value === "string" &&
      value.length >= 8 &&
      !endpoint.includes(value)
    ) {
      sensitiveValues.push({ name: `request body value ${key}`, value });
    }
  }
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`,
      "Content-Type": "application/json",
      "X-Request-ID": "live-s3-browser-tracer",
    },
    body: bodyText,
  });
  const responseBody = await response.json();
  assertPublicResponse(responseBody, `${method} ${endpoint}`);
  return { response, body: responseBody };
}

function assertPublicResponse(response, name) {
  const serialized = JSON.stringify(response);
  for (const [label, value] of [
    ["admin token", process.env.ADMIN_API_TOKEN],
    ["Data Service token", process.env.DATA_SERVICE_TOKEN],
  ]) {
    assert.equal(
      serialized.includes(value),
      false,
      `${name} exposed its ${label}.`,
    );
  }
  for (const field of [
    "accessKeyId",
    "secretAccessKey",
    "sessionToken",
    "storageContainer",
    "objectKey",
  ]) {
    assert.equal(field in response, false, `${name} exposed ${field}.`);
  }
}

async function readSmokeKeys() {
  return (await readFile(smokeKeyFile, "utf8")).split("\n").filter(Boolean);
}

function assertSmokeKey(key) {
  assert.match(
    key,
    /^smoke\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp3$/i,
    "The test-only key generator produced a key outside the smoke UUID scope.",
  );
  return key;
}

async function deleteExactSmokeKeys(keys) {
  if (!keys.length) return [];
  keys.forEach(assertSmokeKey);
  const source = `import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3"; const client = new S3Client({}); const failed = []; for (const Key of process.argv.slice(1)) { try { await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key })); } catch { failed.push(Key); } } console.log(JSON.stringify({ failed }));`;
  const result = await runDocker(
    [
      "exec",
      "-i",
      containerName,
      "node",
      "--input-type=module",
      "-e",
      source,
      ...keys,
    ],
    { captureOutput: true },
  );
  const report = JSON.parse(result.output.trim().split("\n").at(-1));
  return report.failed.map(assertSmokeKey);
}

async function assertSafeLogs(extraValues) {
  const dataServiceContainer = (
    await runDocker([...composeArguments, "ps", "--quiet", "hono-data"], {
      captureOutput: true,
    })
  ).output.trim();
  const logs = [
    (await runDocker(["logs", containerName], { captureOutput: true })).output,
    ...(dataServiceContainer
      ? [
          (
            await runDocker(["logs", dataServiceContainer], {
              captureOutput: true,
            })
          ).output,
        ]
      : []),
    ...(await Promise.all(logFiles.map((file) => readFile(file, "utf8")))),
  ].join("\n");
  const source = `import { readFileSync } from "node:fs"; import { S3Client } from "@aws-sdk/client-s3"; const input = JSON.parse(readFileSync(0, "utf8")); const credentials = await new S3Client({}).config.credentials(); const privateKey = readFileSync("/run/ez-dk-citizen/identity/workload.key", "utf8"); const values = [...input.values, { name: "session access key", value: credentials.accessKeyId }, { name: "session secret key", value: credentials.secretAccessKey }, { name: "session token", value: credentials.sessionToken }, { name: "workload private key", value: privateKey }]; const leaked = values.filter(({ value, pattern }) => pattern ? new RegExp(pattern).test(input.logs) : value && input.logs.includes(value)).map(({ name }) => name); const patterns = [["AWS access key pattern", /\\b(?:AKIA|ASIA)[A-Z0-9]{16}\\b/], ["private key PEM", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/], ["presigned URL signature", /X-Amz-Signature=/i], ["bearer authorization", /authorization:\\s*bearer\\s+\\S+/i]]; const matched = patterns.filter(([, pattern]) => pattern.test(input.logs)).map(([name]) => name); const safe = leaked.length === 0 && matched.length === 0; console.log(JSON.stringify({ safe, leaked, matched }));`;
  const result = await runDocker(
    ["exec", "-i", containerName, "node", "--input-type=module", "-e", source],
    {
      captureOutput: true,
      input: JSON.stringify({ logs, values: extraValues }),
    },
  );
  const report = JSON.parse(result.output.trim().split("\n").at(-1));
  if (!report.safe) {
    throw new Error(
      `Application or audit logs exposed sensitive data (${[...report.leaked, ...report.matched].join(", ")}).`,
    );
  }
}

function findBrowser() {
  const candidates = process.env.BROWSER
    ? [process.env.BROWSER]
    : ["google-chrome", "chromium", "chromium-browser"];
  return candidates.find(
    (candidate) =>
      spawnSync(candidate, ["--version"], {
        env: browserEnvironment,
        stdio: "ignore",
      }).status === 0,
  );
}

async function expectBrowserResult(
  executable,
  profile,
  url,
  expected,
  failureMessage,
) {
  const output = await runProcess(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      `--user-data-dir=${profile}`,
      "--virtual-time-budget=10000",
      "--dump-dom",
      url,
    ],
    { captureOutput: true, env: browserEnvironment },
  );
  if (!new RegExp(`data-result="${expected}"`).test(output.output)) {
    throw new Error(failureMessage ?? "Browser CORS check failed.");
  }
}

async function startPageServer(port, uploadUrl) {
  return listen(
    createServer((request, response) => {
      if (request.url === "/tracer-upload") {
        response.writeHead(200, {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
        });
        response.end(JSON.stringify({ uploadUrl: uploadUrl() }));
        return;
      }
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(page());
    }),
    port,
  ).catch(() => {
    throw new Error(
      `Admin origin http://127.0.0.1:${port} is unavailable; free that port before running the tracer.`,
    );
  });
}

function page() {
  return `<!doctype html><body data-result="running"><script>
const query = new URLSearchParams(location.search);
let bytes = new Uint8Array(${JSON.stringify([...bytes])});
const headers = {"Content-Type":"audio/mpeg","If-None-Match":"*"};
if (query.get("mode") === "unapproved") headers["X-Unapproved"] = "1";
if (query.get("mode") === "wrong-content-type") headers["Content-Type"] = "audio/wav";
if (query.get("mode") === "wrong-length") bytes = new Uint8Array([...bytes, 0]);
if (query.get("mode") === "missing-condition") delete headers["If-None-Match"];
fetch("/tracer-upload", {cache:"no-store"}).then((settings) => {
  if (!settings.ok) throw new Error();
  return settings.json();
}).then(({uploadUrl}) => fetch(uploadUrl, {method:"PUT", headers, body:bytes})).then((response) => {
  const mode = query.get("mode");
  document.body.dataset.result = mode === "upload" && response.ok ? "uploaded" : !response.ok ? "rejected" : "unexpected";
}).catch(() => { document.body.dataset.result = "rejected"; });
</script></body>`;
}

async function availablePort() {
  const server = createServer();
  await listen(server, 0);
  const port = server.address().port;
  await close(server);
  return port;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve(server);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function runDocker(arguments_, options = {}) {
  return runProcess("docker", arguments_, {
    ...options,
    env: composeEnvironment,
  });
}

function runProcess(command, arguments_, options = {}) {
  const { captureOutput = false, input, env = environment } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: repositoryRoot,
      env,
      stdio: [input === undefined ? "ignore" : "pipe", "pipe", "ignore"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      if (captureOutput) output += chunk;
    });
    child.on("error", () => reject(new Error(`${command} could not start.`)));
    child.on("close", (code) => {
      if (code === 0) resolve({ output, exitCode: code });
      else reject(new Error(`${command} command failed.`));
    });
    if (input !== undefined) child.stdin.end(input);
  });
}
