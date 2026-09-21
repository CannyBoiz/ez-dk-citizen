import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const composeFile = path.join(repositoryRoot, "docker-compose.yml");
const projectName = `ez-dk-citizen-integration-${process.pid}-${Date.now().toString(36)}`;
const databaseName = "ez_dk_citizen_integration";
const databaseUser = "ez_dk_citizen_integration";
const databasePassword = "integration-only-password";
const endToEnd = process.argv.includes("--end-to-end");
const composeEnvironment = {
  ...process.env,
  POSTGRES_DB: databaseName,
  POSTGRES_USER: databaseUser,
  POSTGRES_PASSWORD: databasePassword,
  DATA_SERVICE_TOKEN: "integration-only-data-service-token",
  AWS_REGION: "eu-north-1",
  S3_BUCKET: "integration-only-bucket",
  ...(endToEnd ? { ADMIN_API_TOKEN: "integration-only-admin-token" } : {}),
};
const composeArguments = [
  "compose",
  "--file",
  composeFile,
  "--project-name",
  projectName,
];

await runDocker([...composeArguments, "config", "--quiet"]);
assertPrivateCompiledTopology(
  JSON.parse(
    await captureDocker([...composeArguments, "config", "--format", "json"]),
  ),
);

let integrationFailure;

try {
  await runDocker([
    ...composeArguments,
    "up",
    "--detach",
    "--build",
    "--wait",
    "--wait-timeout",
    "120",
    endToEnd ? "bff" : "hono-data",
  ]);
  if (endToEnd) {
    await verifyBffReadiness();
    await verifyDistinctCredentials();
    await runDocker([
      ...composeArguments,
      "exec",
      "-T",
      "bff",
      "node",
      "-e",
      tracer(),
    ]);
    await runDocker([
      ...composeArguments,
      "exec",
      "-T",
      "bff",
      "node",
      "--input-type=module",
      "-e",
      completionTracer(),
    ]);
    await verifyTracerLogs();
  } else {
    await runDocker([
      ...composeArguments,
      "--profile",
      "integration",
      "run",
      "--no-deps",
      "--rm",
      "postgres-check",
    ]);
    await runDocker([
      ...composeArguments,
      "--profile",
      "integration",
      "run",
      "--no-deps",
      "--rm",
      "postgres-test",
    ]);
    await runDocker([
      ...composeArguments,
      "run",
      "--no-deps",
      "--rm",
      "migrate",
    ]);
    await runDocker([
      ...composeArguments,
      "--profile",
      "integration",
      "run",
      "--no-deps",
      "--rm",
      "postgres-check",
    ]);
    await verifyFailedMigrationBlocksDataService();
  }
} catch (error) {
  integrationFailure = error;
} finally {
  try {
    await runDocker([
      ...composeArguments,
      "down",
      "--volumes",
      "--remove-orphans",
    ]);
  } catch (cleanupError) {
    integrationFailure ??= cleanupError;
  }
}

if (integrationFailure) {
  throw integrationFailure;
}

console.log(
  endToEnd
    ? "Stage 2 end-to-end tracer passed."
    : "PostgreSQL foundation integration suite passed.",
);

function tracer() {
  return String.raw`
const requestId = 'stage-2-tracer';
const headers = { Authorization: 'Bearer integration-only-admin-token', 'Content-Type': 'application/json', 'X-Request-ID': requestId };
const call = async (path, method, body) => {
  const response = await fetch('http://127.0.0.1:3000' + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { response, body: response.status === 204 ? undefined : await response.json() };
};
const lesson = await call('/api/admin/lessons', 'POST', { chapter: 1, version: 1 });
if (lesson.response.status !== 201 || lesson.response.headers.get('x-request-id') !== requestId) throw new Error('Lesson creation failed.');
if ((await fetch('http://127.0.0.1:3000/api/mobile/lessons')).status !== 200) throw new Error('Mobile list failed.');
if ((await (await fetch('http://127.0.0.1:3000/api/mobile/lessons')).json()).items.length) throw new Error('Draft leaked to mobile.');
await call('/api/admin/lessons/' + lesson.body.id + '/texts/th', 'PUT', { title: 'ไทย', content: 'เนื้อหา' });
const source = await call('/api/admin/sources', 'POST', { url: 'https://example.test/source', publishedAt: null });
await call('/api/admin/lessons/' + lesson.body.id + '/sources/' + source.body.id, 'PUT', { pageFrom: 2, pageTo: 3 });
await call('/api/admin/lessons/' + lesson.body.id, 'PATCH', { status: 'PUBLISHED' });
const mobile = await fetch('http://127.0.0.1:3000/api/mobile/lessons');
const list = await mobile.json();
if (list.items[0]?.title !== 'ไทย' || list.items[0]?.languageCode !== 'th' || 'status' in list.items[0]) throw new Error('Mobile list projection failed.');
const detail = await (await fetch('http://127.0.0.1:3000/api/mobile/lessons/' + lesson.body.id)).json();
if (detail.content !== 'เนื้อหา' || !detail.availableLanguageCodes.includes('th') || detail.lessonSources[0]?.pageFrom !== 2 || detail.lessonSources[0]?.pageTo !== 3 || 'audio' in detail) throw new Error('Mobile detail projection failed.');
`;
}

function completionTracer() {
  return String.raw`
import { createBffApp } from './dist/app.js';
import { createDataServiceClient } from './dist/data-service-client.js';
import { FakeStorage } from './dist/storage.js';

const requestId = 'stage-3-completion-tracer';
const headers = { Authorization: 'Bearer integration-only-admin-token', 'Content-Type': 'application/json', 'X-Request-ID': requestId };
const storage = new FakeStorage();
const dataServiceClient = createDataServiceClient('http://hono-data:3000', 'integration-only-data-service-token');
const app = createBffApp(async () => undefined, {
  adminApiToken: 'integration-only-admin-token',
  storage,
  storageBucket: 'integration-only-bucket',
  dataServiceClient,
});
const call = async (path, method, body) => {
  const response = await app.request(path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { response, body: response.status === 204 ? undefined : await response.json() };
};
const lesson = await call('/api/admin/lessons', 'POST', { chapter: 2, version: 1 });
if (lesson.response.status !== 201) throw new Error('Completion tracer Lesson creation failed.');
const text = await call('/api/admin/lessons/' + lesson.body.id + '/texts/th', 'PUT', { title: 'ไทย', content: 'เนื้อหา' });
if (text.response.status !== 200) throw new Error('Completion tracer localization failed.');
const intent = await call('/api/admin/media/upload-intents', 'POST', { lessonId: lesson.body.id, languageCode: 'th', originalFilename: 'lesson.mp3', contentType: 'audio/mpeg', sizeBytes: 1 });
if (intent.response.status !== 201 || storage.uploads.length !== 1) throw new Error('Completion tracer Upload Intent failed.');
storage.putObject(storage.uploads[0].key, { contentType: 'audio/mpeg', sizeBytes: 1 });
const completed = await call('/api/admin/media/' + intent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (completed.response.status !== 200 || completed.body.mediaAsset.status !== 'READY' || completed.body.lessonAudio.audioVersion !== 1 || completed.body.lessonAudio.isCurrent !== true || 'objectKey' in completed.body.mediaAsset) throw new Error('Completion tracer did not promote safe current audio.');
const retry = await call('/api/admin/media/' + intent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (retry.response.status !== 200 || JSON.stringify(retry.body) !== JSON.stringify(completed.body)) throw new Error('Completion retry was not idempotent.');
await call('/api/admin/lessons/' + lesson.body.id + '/texts/da', 'PUT', { title: 'Dansk', content: 'Indhold' });
const rebind = await call('/api/admin/media/' + intent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'da' });
if (rebind.response.status !== 409 || rebind.body.code !== 'media_asset_rebind_conflict') throw new Error('Completed media was rebound.');
await call('/api/admin/lessons/' + lesson.body.id, 'PATCH', { status: 'PUBLISHED' });
const correctionIntent = await call('/api/admin/media/upload-intents', 'POST', { lessonId: lesson.body.id, languageCode: 'th', originalFilename: 'correction.mp3', contentType: 'audio/mpeg', sizeBytes: 1 });
storage.putObject(storage.uploads.at(-1).key, { contentType: 'audio/mpeg', sizeBytes: 1 });
const corrected = await call('/api/admin/media/' + correctionIntent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (corrected.response.status !== 200 || corrected.body.lessonAudio.audioVersion !== 2 || !corrected.body.lessonAudio.isCurrent) throw new Error('Corrected audio was not promoted.');
const correctedRetry = await call('/api/admin/media/' + correctionIntent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (correctedRetry.response.status !== 200 || JSON.stringify(correctedRetry.body) !== JSON.stringify(corrected.body)) throw new Error('Corrected audio retry created a new version.');
const playbackStart = storage.playbackAuthorizations.length;
const playback = await call('/api/mobile/lessons/' + lesson.body.id, 'GET');
if (playback.response.status !== 200 || playback.response.headers.get('cache-control') !== 'no-store' || playback.body.audio?.audioVersion !== 2 || playback.body.audio?.mediaAssetId !== correctionIntent.body.mediaAssetId || Object.keys(playback.body.audio ?? {}).sort().join(',') !== 'audioVersion,contentType,durationMs,mediaAssetId,playbackExpiresAt,playbackUrl,sizeBytes') throw new Error('Mobile playback projection failed.');
const freshPlayback = await call('/api/mobile/lessons/' + lesson.body.id, 'GET');
if (freshPlayback.response.status !== 200 || storage.playbackAuthorizations.length !== playbackStart + 2 || storage.playbackAuthorizations.slice(-2).some((key) => key !== storage.uploads[1].key)) throw new Error('Playback authorization was not freshly scoped to current audio.');
const uploadStart = storage.uploads.length;
const concurrentIntents = await Promise.all(['concurrent-a.mp3', 'concurrent-b.mp3'].map((originalFilename) => call('/api/admin/media/upload-intents', 'POST', { lessonId: lesson.body.id, languageCode: 'th', originalFilename, contentType: 'audio/mpeg', sizeBytes: 1 })));
for (const upload of storage.uploads.slice(uploadStart)) storage.putObject(upload.key, { contentType: 'audio/mpeg', sizeBytes: 1 });
const concurrent = await Promise.all(concurrentIntents.map((intent) => call('/api/admin/media/' + intent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' })));
if (concurrent.some(({ response }) => response.status !== 200) || concurrent.map(({ body }) => body.lessonAudio.audioVersion).sort().join(',') !== '3,4' || !concurrent.some(({ body }) => body.lessonAudio.audioVersion === 4 && body.lessonAudio.isCurrent)) throw new Error('Concurrent corrections were not serialized.');
const missingIntent = await call('/api/admin/media/upload-intents', 'POST', { lessonId: lesson.body.id, languageCode: 'th', originalFilename: 'missing.mp3', contentType: 'audio/mpeg', sizeBytes: 1 });
const missing = await call('/api/admin/media/' + missingIntent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (missing.response.status !== 409 || missing.body.code !== 'upload_incomplete' || (await dataServiceClient.getMediaAsset(missingIntent.body.mediaAssetId, requestId)).status !== 'PENDING') throw new Error('Missing upload was not left retryable.');
const inspectObject = storage.inspectObject.bind(storage);
const transientIntent = await call('/api/admin/media/upload-intents', 'POST', { lessonId: lesson.body.id, languageCode: 'th', originalFilename: 'transient.mp3', contentType: 'audio/mpeg', sizeBytes: 1 });
const transientKey = storage.uploads.at(-1).key;
storage.inspectObject = async (key) => key === transientKey ? Promise.reject(Object.assign(new Error('temporary storage failure'), { name: 'SlowDown' })) : inspectObject(key);
const transient = await call('/api/admin/media/' + transientIntent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (transient.response.status !== 503 || transient.body.code !== 'storage_unavailable' || (await dataServiceClient.getMediaAsset(transientIntent.body.mediaAssetId, requestId)).status !== 'PENDING') throw new Error('Transient upload failure was not left retryable.');
storage.inspectObject = inspectObject;
const invalidIntent = await call('/api/admin/media/upload-intents', 'POST', { lessonId: lesson.body.id, languageCode: 'th', originalFilename: 'invalid.mp3', contentType: 'audio/mpeg', sizeBytes: 1 });
const invalidKey = storage.uploads.at(-1).key;
storage.putObject(invalidKey, { contentType: 'audio/mpeg', sizeBytes: 2 });
const invalid = await call('/api/admin/media/' + invalidIntent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (invalid.response.status !== 422 || invalid.body.code !== 'invalid_uploaded_media' || (await dataServiceClient.getMediaAsset(invalidIntent.body.mediaAssetId, requestId)).status !== 'FAILED') throw new Error('Invalid upload was not failed.');
try { await storage.inspectObject(invalidKey); throw new Error('Invalid object was not deleted.'); } catch (error) { if (error.message !== 'S3 object was not found.') throw error; }
const failedRetry = await call('/api/admin/media/' + invalidIntent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (failedRetry.response.status !== 409 || failedRetry.body.code !== 'media_asset_failed') throw new Error('Failed upload was not terminal.');
const typeIntent = await call('/api/admin/media/upload-intents', 'POST', { lessonId: lesson.body.id, languageCode: 'th', originalFilename: 'wrong-type.mp3', contentType: 'audio/mpeg', sizeBytes: 1 });
storage.putObject(storage.uploads.at(-1).key, { contentType: 'audio/ogg', sizeBytes: 1 });
const wrongType = await call('/api/admin/media/' + typeIntent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (wrongType.response.status !== 422 || (await dataServiceClient.getMediaAsset(typeIntent.body.mediaAssetId, requestId)).status !== 'FAILED') throw new Error('Wrong content type was not failed.');
const deleteObject = storage.deleteObject.bind(storage);
const cleanupIntent = await call('/api/admin/media/upload-intents', 'POST', { lessonId: lesson.body.id, languageCode: 'th', originalFilename: 'cleanup.mp3', contentType: 'audio/mpeg', sizeBytes: 1 });
const cleanupKey = storage.uploads.at(-1).key;
storage.putObject(cleanupKey, { contentType: 'audio/mpeg', sizeBytes: 2 });
storage.deleteObject = async (key) => key === cleanupKey ? Promise.reject(Object.assign(new Error('cleanup failed'), { name: 'AccessDenied' })) : deleteObject(key);
const cleanup = await call('/api/admin/media/' + cleanupIntent.body.mediaAssetId + '/complete', 'POST', { lessonId: lesson.body.id, languageCode: 'th' });
if (cleanup.response.status !== 422 || (await dataServiceClient.getMediaAsset(cleanupIntent.body.mediaAssetId, requestId)).status !== 'FAILED') throw new Error('Cleanup failure restored invalid media.');
`;
}

async function verifyBffReadiness() {
  await runDocker([
    ...composeArguments,
    "exec",
    "-T",
    "bff",
    "node",
    "-e",
    "Promise.all(['/health', '/ready'].map(async (path) => { const response = await fetch('http://127.0.0.1:3000' + path); if (!response.ok) throw new Error(path + ' is unavailable'); }))",
  ]);
  await runDocker([...composeArguments, "pause", "hono-data"]);
  try {
    await runDocker([
      ...composeArguments,
      "exec",
      "-T",
      "bff",
      "node",
      "-e",
      "Promise.all([fetch('http://127.0.0.1:3000/health'), fetch('http://127.0.0.1:3000/ready')]).then(async ([health, ready]) => { if (!health.ok || ready.status !== 503) throw new Error('BFF liveness and readiness are not independent'); })",
    ]);
  } finally {
    await runDocker([...composeArguments, "unpause", "hono-data"]);
  }
  await runDocker([
    ...composeArguments,
    "exec",
    "-T",
    "bff",
    "node",
    "-e",
    "for (let attempt = 0; attempt < 20; attempt += 1) { if ((await fetch('http://127.0.0.1:3000/ready')).ok) process.exit(0); await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error('BFF did not become ready');",
  ]);
}

async function verifyDistinctCredentials() {
  await runDocker([
    ...composeArguments,
    "exec",
    "-T",
    "bff",
    "node",
    "-e",
    "fetch('http://hono-data:3000/internal/lessons', { headers: { Authorization: 'Bearer integration-only-admin-token' } }).then((response) => { if (response.status !== 401) throw new Error('Admin credential reached the Data Service'); })",
  ]);
}

async function verifyTracerLogs() {
  const logs = await Promise.all(
    ["bff", "hono-data"].map((service) =>
      captureDocker([...composeArguments, "logs", "--no-log-prefix", service]),
    ),
  );
  for (const output of logs) {
    const entries = output
      .split("\n")
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      })
      .filter((entry) => entry.requestId === "stage-2-tracer");
    assert.ok(entries.length > 0, "Expected completion logs for the tracer.");
    for (const entry of entries) {
      assert.equal(typeof entry.method, "string");
      assert.equal(typeof entry.path, "string");
      assert.equal(typeof entry.status, "number");
      assert.equal(typeof entry.durationMs, "number");
    }
    for (const secret of [
      "integration-only-admin-token",
      "integration-only-data-service-token",
      "เนื้อหา",
    ]) {
      assert.doesNotMatch(output, new RegExp(secret));
    }
  }
}

function assertPrivateCompiledTopology(config) {
  assert.equal(config.services.postgres.ports, undefined);
  assert.equal(config.services["hono-data"].ports, undefined);
  assert.equal(config.services.bff.ports, undefined);
  assert.equal(config.services.bff.environment.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(
    config.services.bff.environment.AWS_SECRET_ACCESS_KEY,
    undefined,
  );
  assert.equal(
    config.services.bff.depends_on["hono-data"].condition,
    "service_healthy",
  );
  assert.equal(
    config.services["hono-data"].depends_on.migrate.condition,
    "service_completed_successfully",
  );
  assert.equal(
    config.services.migrate.depends_on.postgres.condition,
    "service_healthy",
  );
}

async function verifyFailedMigrationBlocksDataService() {
  const exitCode = await runDockerForExitCode([
    ...composeArguments,
    "--profile",
    "integration-failure",
    "up",
    "--detach",
    "--wait",
    "--wait-timeout",
    "30",
    "data-after-failed-migration",
  ]);
  assert.notEqual(exitCode, 0, "The intentionally broken migration must fail.");

  const failedMigration = await captureDocker([
    ...composeArguments,
    "ps",
    "--all",
    "--format",
    "{{.Service}}|{{.State}}|{{.ExitCode}}",
    "migration-failure",
  ]);
  assert.match(failedMigration, /^migration-failure\|exited\|[1-9]\d*$/m);

  const runningBlockedService = await captureDocker([
    ...composeArguments,
    "ps",
    "--status",
    "running",
    "--services",
    "data-after-failed-migration",
  ]);
  assert.equal(
    runningBlockedService.trim(),
    "",
    "The Data Service must remain stopped after migration failure.",
  );
}

async function runDocker(arguments_) {
  await spawnDocker(arguments_);
}

async function runDockerForExitCode(arguments_) {
  const { exitCode } = await spawnDocker(arguments_, { allowFailure: true });
  return exitCode;
}

async function captureDocker(arguments_) {
  const { output } = await spawnDocker(arguments_, { captureOutput: true });
  return output;
}

function spawnDocker(
  arguments_,
  { allowFailure = false, captureOutput = false } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", arguments_, {
      cwd: repositoryRoot,
      env: composeEnvironment,
      stdio: captureOutput ? ["ignore", "pipe", "inherit"] : "inherit",
    });
    let output = "";

    if (captureOutput && child.stdout) {
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        output += chunk;
      });
    }
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      const exitCode = code ?? 1;

      if (exitCode === 0 || allowFailure) {
        resolve({ exitCode, output });
        return;
      }

      const outcome = signal ? `signal ${signal}` : `exit code ${exitCode}`;
      reject(
        new Error(`docker ${arguments_.join(" ")} failed with ${outcome}`),
      );
    });
  });
}
