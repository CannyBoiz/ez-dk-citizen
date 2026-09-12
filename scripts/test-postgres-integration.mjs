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
    'hono-data',
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
