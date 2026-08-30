import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
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
const postgresPort = await findAvailablePort();
const composeEnvironment = {
  ...process.env,
  POSTGRES_DB: databaseName,
  POSTGRES_USER: databaseUser,
  POSTGRES_PASSWORD: databasePassword,
  POSTGRES_PORT: String(postgresPort),
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

console.log('PostgreSQL foundation smoke test passed.');

function runDocker(arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', arguments_, {
      cwd: repositoryRoot,
      env: composeEnvironment,
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const outcome = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`docker ${arguments_.join(' ')} failed with ${outcome}`));
    });
  });
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not reserve a PostgreSQL integration port.'));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}
