import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const composeFile = path.join(repositoryRoot, 'docker-compose.yml');
const projectName = `ez-dk-citizen-integration-${process.pid}-${Date.now().toString(36)}`;
const databaseName = 'ez_dk_citizen_integration';
const databaseUser = 'ez_dk_citizen_integration';
const databasePassword = 'integration-only-password';
const composeEnvironment = {
  ...process.env,
  POSTGRES_DB: databaseName,
  POSTGRES_USER: databaseUser,
  POSTGRES_PASSWORD: databasePassword,
  DATA_SERVICE_TOKEN: 'integration-only-data-service-token',
  ADMIN_API_TOKEN: 'integration-only-admin-token',
};
const composeArguments = [
  'compose',
  '--file',
  composeFile,
  '--project-name',
  projectName,
];

await runDocker([...composeArguments, 'config', '--quiet']);

let integrationFailure;

try {
  await runDocker([
    ...composeArguments,
    'up',
    '--detach',
    '--build',
    '--wait',
    '--wait-timeout',
    '120',
    'bff',
  ]);
  await runDocker([
    ...composeArguments,
    '--profile',
    'integration',
    'run',
    '--no-deps',
    '--rm',
    'postgres-check',
  ]);
  await runDocker([
    ...composeArguments,
    'exec',
    '-T',
    'bff',
    'node',
    '-e',
    tracer(),
  ]);
  await runDocker([
    ...composeArguments,
    '--profile',
    'integration',
    'run',
    '--no-deps',
    '--rm',
    'postgres-test',
  ]);
  await runDocker([
    ...composeArguments,
    'run',
    '--no-deps',
    '--rm',
    'migrate',
  ]);
  await runDocker([
    ...composeArguments,
    '--profile',
    'integration',
    'run',
    '--no-deps',
    '--rm',
    'postgres-check',
  ]);
  await verifyFailedMigrationBlocksDataService();
} catch (error) {
  integrationFailure = error;
} finally {
  try {
    await runDocker([
      ...composeArguments,
      'down',
      '--volumes',
      '--remove-orphans',
    ]);
  } catch (cleanupError) {
    integrationFailure ??= cleanupError;
  }
}

if (integrationFailure) {
  throw integrationFailure;
}

console.log('PostgreSQL foundation integration suite passed.');

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
if (list.items[0]?.title !== 'ไทย' || 'status' in list.items[0]) throw new Error('Mobile list projection failed.');
const detail = await (await fetch('http://127.0.0.1:3000/api/mobile/lessons/' + lesson.body.id)).json();
if (detail.content !== 'เนื้อหา' || detail.lessonSources[0]?.pageFrom !== 2 || 'audio' in detail) throw new Error('Mobile detail projection failed.');
`;
}

async function verifyFailedMigrationBlocksDataService() {
  const exitCode = await runDockerForExitCode([
    ...composeArguments,
    '--profile',
    'integration-failure',
    'up',
    '--detach',
    '--wait',
    '--wait-timeout',
    '30',
    'data-after-failed-migration',
  ]);
  assert.notEqual(exitCode, 0, 'The intentionally broken migration must fail.');

  const failedMigration = await captureDocker([
    ...composeArguments,
    'ps',
    '--all',
    '--format',
    '{{.Service}}|{{.State}}|{{.ExitCode}}',
    'migration-failure',
  ]);
  assert.match(failedMigration, /^migration-failure\|exited\|[1-9]\d*$/m);

  const runningBlockedService = await captureDocker([
    ...composeArguments,
    'ps',
    '--status',
    'running',
    '--services',
    'data-after-failed-migration',
  ]);
  assert.equal(
    runningBlockedService.trim(),
    '',
    'The Data Service must remain stopped after migration failure.',
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
    const child = spawn('docker', arguments_, {
      cwd: repositoryRoot,
      env: composeEnvironment,
      stdio: captureOutput ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    });
    let output = '';

    if (captureOutput && child.stdout) {
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
    }
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      const exitCode = code ?? 1;

      if (exitCode === 0 || allowFailure) {
        resolve({ exitCode, output });
        return;
      }

      const outcome = signal ? `signal ${signal}` : `exit code ${exitCode}`;
      reject(new Error(`docker ${arguments_.join(' ')} failed with ${outcome}`));
    });
  });
}
