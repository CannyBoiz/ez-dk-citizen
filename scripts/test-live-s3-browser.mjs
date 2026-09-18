import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const origin = "http://127.0.0.1:5173";
const rejectedOrigin = "http://127.0.0.1:5174";
const requiredEnvironment = [
  "ADMIN_API_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "DATA_SERVICE_TOKEN",
  "DATA_SERVICE_URL",
  "LIVE_S3_TRACER_LESSON_ID",
  "LIVE_S3_TRACER_LOG_FILES",
  "S3_BUCKET",
];
const missing = requiredEnvironment.filter((name) => !process.env[name]);
if (missing.length) {
  throw new Error(
    `Live S3 tracer requires ${missing.join(", ")}. Run scripts/setup-aws-s3.sh first.`,
  );
}

const lessonId = Number(process.env.LIVE_S3_TRACER_LESSON_ID);
if (!Number.isSafeInteger(lessonId) || lessonId <= 0) {
  throw new Error("LIVE_S3_TRACER_LESSON_ID must be a positive integer.");
}
const languageCode = process.env.LIVE_S3_TRACER_LANGUAGE_CODE ?? "th";
const logFiles =
  process.env.LIVE_S3_TRACER_LOG_FILES.split(",").filter(Boolean);
if (!logFiles.length) {
  throw new Error(
    "LIVE_S3_TRACER_LOG_FILES must name the Data Service and storage audit log files.",
  );
}
const browser = findBrowser();
if (!browser) {
  throw new Error(
    "A Chromium-family browser is required. Set BROWSER to its executable path.",
  );
}

const dataServiceUrl = new URL(process.env.DATA_SERVICE_URL);
const ready = await fetch(new URL("/ready", dataServiceUrl), {
  signal: AbortSignal.timeout(5_000),
}).catch(() => undefined);
if (!ready?.ok) {
  throw new Error(
    "Data Service is unavailable; start it before the live tracer.",
  );
}

const [{ createBffApp }, { createDataServiceClient }, { createS3Storage }] =
  await Promise.all([
    import("../apps/bff/dist/app.js"),
    import("../apps/bff/dist/data-service-client.js"),
    import("../apps/bff/dist/storage.js"),
  ]);
const requireBff = createRequire(
  new URL("../apps/bff/package.json", import.meta.url),
);
const { DeleteObjectCommand, GetObjectCommand, S3Client } =
  requireBff("@aws-sdk/client-s3");
const smokeKeys = [];
const cleanupFailures = [];
const bytes = new Uint8Array([73, 68, 51, 4, 0, 0, 0, 0]);
const storage = createS3Storage({
  region: process.env.AWS_REGION,
  bucket: process.env.S3_BUCKET,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
try {
  await s3.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: `smoke/${randomUUID()}.mp3`,
    }),
  );
} catch (error) {
  if (!["NoSuchKey", "NotFound"].includes(error.name)) {
    throw new Error(
      "AWS S3 configuration is unavailable; verify AWS_REGION, S3_BUCKET, and the dedicated IAM key.",
    );
  }
}
const app = createBffApp(
  async () => {
    const response = await fetch(new URL("/ready", dataServiceUrl), {
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("Data Service is unavailable.");
  },
  {
    adminApiToken: process.env.ADMIN_API_TOKEN,
    adminOrigins: [origin],
    dataServiceClient: createDataServiceClient(
      dataServiceUrl.toString(),
      process.env.DATA_SERVICE_TOKEN,
      5_000,
    ),
    objectKeyGenerator: () => {
      const key = `smoke/${randomUUID()}.mp3`;
      smokeKeys.push(key);
      return key;
    },
    storage,
    storageBucket: process.env.S3_BUCKET,
  },
);

let bffServer;
let allowedServer;
let rejectedServer;
let browserProfile;
let tracerFailure;
const applicationLogs = [];
const originalConsoleLog = console.log;
console.log = (...values) => applicationLogs.push(values.join(" "));
try {
  bffServer = await startBff(app);
  const bffUrl = `http://127.0.0.1:${bffServer.address().port}`;
  allowedServer = await startPageServer(5173);
  rejectedServer = await startPageServer(5174);
  browserProfile = await mkdtemp(join(tmpdir(), "ez-dk-s3-browser-"));

  const intent = await requestBff(
    bffUrl,
    "/api/admin/media/upload-intents",
    "POST",
    {
      lessonId,
      languageCode,
      originalFilename: "smoke.mp3",
      contentType: "audio/mpeg",
      sizeBytes: bytes.byteLength,
    },
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
  assert.equal(smokeKeys.length, 1, "Tracer did not create one smoke key.");

  await expectBrowserResult(
    browser,
    browserProfile,
    `${rejectedOrigin}/?mode=disallowed&uploadUrl=${encodeURIComponent(intent.body.uploadUrl)}`,
    "rejected",
  );
  await expectBrowserResult(
    browser,
    browserProfile,
    `${origin}/?mode=unapproved&uploadUrl=${encodeURIComponent(intent.body.uploadUrl)}`,
    "rejected",
  );
  await expectBrowserResult(
    browser,
    browserProfile,
    `${origin}/?mode=upload&uploadUrl=${encodeURIComponent(intent.body.uploadUrl)}`,
    "uploaded",
    "Allowed Admin origin CORS preflight or direct PUT failed.",
  );
  await expectBrowserResult(
    browser,
    browserProfile,
    `${origin}/?mode=overwrite&uploadUrl=${encodeURIComponent(intent.body.uploadUrl)}`,
    "rejected",
  );

  const completed = await requestBff(
    bffUrl,
    `/api/admin/media/${intent.body.mediaAssetId}/complete`,
    "POST",
    { lessonId, languageCode },
  );
  assert.equal(
    completed.response.status,
    200,
    "Media Asset was not completed.",
  );

  const mobile = await fetch(
    `${bffUrl}/api/mobile/lessons/${lessonId}?language=${encodeURIComponent(languageCode)}`,
  );
  assert.equal(mobile.status, 200, "Mobile Lesson was not returned.");
  const lesson = await mobile.json();
  assert.equal(mobile.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(lesson.audio ?? {}).sort(), [
    "audioVersion",
    "contentType",
    "durationMs",
    "mediaAssetId",
    "playbackExpiresAt",
    "playbackUrl",
    "sizeBytes",
  ]);
  assert.equal(
    JSON.stringify(lesson).includes(process.env.ADMIN_API_TOKEN),
    false,
  );
  assert.equal(
    JSON.stringify(lesson).includes(process.env.AWS_SECRET_ACCESS_KEY),
    false,
  );
  assert.equal("storageContainer" in lesson.audio, false);
  assert.equal("objectKey" in lesson.audio, false);

  const playback = await fetch(lesson.audio.playbackUrl);
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
  assertSafeLogs(
    [
      ...applicationLogs,
      ...(await Promise.all(logFiles.map((file) => readFile(file, "utf8")))),
    ],
    intent.body.uploadUrl,
  );
} catch (error) {
  tracerFailure = error;
} finally {
  for (const key of smokeKeys) {
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
      );
    } catch {
      cleanupFailures.push(key);
    }
  }
  await Promise.all(
    [bffServer, allowedServer, rejectedServer].filter(Boolean).map(close),
  );
  if (browserProfile)
    await rm(browserProfile, { force: true, recursive: true });
  console.log = originalConsoleLog;
}

if (cleanupFailures.length) {
  throw new Error(
    `Live S3 tracer cleanup failed; delete these exact smoke objects manually: ${cleanupFailures.join(", ")}.`,
  );
}
if (tracerFailure) throw tracerFailure;
console.log("Live browser-to-S3 tracer passed.");

function findBrowser() {
  const candidates = process.env.BROWSER
    ? [process.env.BROWSER]
    : ["google-chrome", "chromium", "chromium-browser"];
  return candidates.find(
    (candidate) =>
      spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0,
  );
}

function startBff(app) {
  return listen(
    createServer(async (request, response) => {
      const body = await read(request);
      const result = await app.fetch(
        new Request(`http://127.0.0.1${request.url}`, {
          method: request.method,
          headers: request.headers,
          ...(body.byteLength ? { body } : {}),
        }),
      );
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    }),
    0,
  );
}

function startPageServer(port) {
  return listen(
    createServer((_request, response) => {
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
const uploadUrl = query.get("uploadUrl");
const bytes = new Uint8Array(${JSON.stringify([...bytes])});
const headers = {"Content-Type":"audio/mpeg","If-None-Match":"*"};
if (query.get("mode") === "unapproved") headers["X-Unapproved"] = "1";
fetch(uploadUrl, {method:"PUT", headers, body:bytes}).then((response) => {
  const mode = query.get("mode");
  document.body.dataset.result = mode === "upload" && response.ok ? "uploaded" : !response.ok ? "rejected" : "unexpected";
}).catch(() => { document.body.dataset.result = "rejected"; });
</script></body>`;
}

async function requestBff(bffUrl, path, method, body) {
  const response = await fetch(`${bffUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.ADMIN_API_TOKEN}`,
      "Content-Type": "application/json",
      "X-Request-ID": "live-s3-browser-tracer",
    },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

async function expectBrowserResult(
  browser,
  profile,
  url,
  expected,
  failureMessage,
) {
  const output = await run(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    `--user-data-dir=${profile}`,
    "--virtual-time-budget=10000",
    "--dump-dom",
    url,
  ]);
  if (!new RegExp(`data-result="${expected}"`).test(output)) {
    throw new Error(failureMessage ?? "Browser CORS check failed.");
  }
}

function assertSafeLogs(logs, uploadUrl) {
  const output = logs.join("\n");
  for (const value of [
    process.env.ADMIN_API_TOKEN,
    process.env.DATA_SERVICE_TOKEN,
    process.env.AWS_ACCESS_KEY_ID,
    process.env.AWS_SECRET_ACCESS_KEY,
    uploadUrl,
    JSON.stringify({
      lessonId,
      languageCode,
      originalFilename: "smoke.mp3",
      contentType: "audio/mpeg",
      sizeBytes: bytes.byteLength,
    }),
  ]) {
    assert.equal(
      output.includes(value),
      false,
      "Application logs exposed sensitive data.",
    );
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.on("error", () => reject(new Error("Browser could not start.")));
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error("Browser tracer failed.")),
    );
  });
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

function read(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}
