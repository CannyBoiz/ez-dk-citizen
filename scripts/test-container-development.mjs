import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createConnection, createServer } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const projectName = `ez-dk-citizen-development-test-${process.pid}-${Date.now().toString(36)}`;
const bffPort = await findAvailablePort();
let postgresPort = await findAvailablePort();

while (postgresPort === bffPort) {
  postgresPort = await findAvailablePort();
}
const composeEnvironment = {
  ...process.env,
  BFF_PORT: String(bffPort),
  POSTGRES_PORT: String(postgresPort),
};

for (const name of [
  "ADMIN_API_TOKEN",
  "ADMIN_ORIGINS",
  "AWS_REGION",
  "S3_BUCKET",
  "DATABASE_URL",
  "DATA_SERVICE_TOKEN",
  "POSTGRES_DB",
  "POSTGRES_PASSWORD",
  "POSTGRES_USER",
]) {
  delete composeEnvironment[name];
}

const composeArguments = [
  "compose",
  "--env-file",
  "/dev/null",
  "--file",
  path.join(repositoryRoot, "docker-compose.yml"),
  "--file",
  path.join(repositoryRoot, "docker-compose.override.yml"),
  "--project-name",
  projectName,
];
const { output: configOutput } = await spawnDocker(
  [...composeArguments, "config", "--format", "json"],
  true,
);
const config = JSON.parse(configOutput);

assertPublishedPort(config.services.bff, bffPort, 3000);
assertPublishedPort(config.services.postgres, postgresPort, 5432);
assert.equal(config.services["hono-data"].ports, undefined);
assertWatch(
  config.services.bff,
  [["apps/bff/src", "/workspace/apps/bff/src"]],
  [
    "apps/bff/Dockerfile",
    "apps/bff/package.json",
    "package.json",
    "packages/api-contracts",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ],
);
assertWatch(
  config.services["hono-data"],
  [
    ["apps/data/drizzle", "/workspace/apps/data/drizzle"],
    ["apps/data/src", "/workspace/apps/data/src"],
  ],
  [
    "apps/data/Dockerfile",
    "apps/data/package.json",
    "package.json",
    "packages/api-contracts",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ],
);

let smokeFailure;

try {
  await spawnDocker([
    ...composeArguments,
    "up",
    "--detach",
    "--build",
    "--wait",
    "--wait-timeout",
    "120",
    "bff",
  ]);

  const response = await fetch(`http://127.0.0.1:${bffPort}/ready`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  await connectTo(postgresPort);
} catch (error) {
  smokeFailure = error;
} finally {
  try {
    await spawnDocker([
      ...composeArguments,
      "down",
      "--volumes",
      "--remove-orphans",
    ]);
  } catch (cleanupError) {
    smokeFailure ??= cleanupError;
  }
}

if (smokeFailure) {
  throw smokeFailure;
}

console.log("Container development smoke test passed.");

function assertPublishedPort(service, published, target) {
  assert.ok(
    service.ports?.some(
      (port) =>
        port.host_ip === "127.0.0.1" &&
        Number(port.published) === published &&
        port.target === target,
    ),
  );
}

function assertWatch(service, synchronizedPaths, rebuiltPaths) {
  const rules = service.develop?.watch ?? [];
  const actualSynchronizedPaths = rules
    .filter(({ action }) => action === "sync")
    .map(({ path: watchedPath, target }) => [relativePath(watchedPath), target])
    .sort();
  const actualRebuiltPaths = rules
    .filter(({ action }) => action === "rebuild")
    .map(({ path: watchedPath }) => relativePath(watchedPath))
    .sort();

  assert.deepEqual(actualSynchronizedPaths, synchronizedPaths);
  assert.deepEqual(actualRebuiltPaths, rebuiltPaths);
}

function relativePath(watchedPath) {
  return path
    .relative(repositoryRoot, path.resolve(repositoryRoot, watchedPath))
    .replaceAll("\\", "/");
}

function spawnDocker(arguments_, captureOutput = false) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", arguments_, {
      cwd: repositoryRoot,
      env: composeEnvironment,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    let errorOutput = "";

    child.stdout?.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      errorOutput += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve({ output });
        return;
      }

      reject(
        new Error(
          `docker ${arguments_.join(" ")} failed with ${signal ?? `exit code ${code}`}: ${`${errorOutput}\n${output}`.trim()}`,
        ),
      );
    });
  });
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        reject(new Error("Could not reserve a development test port."));
        return;
      }

      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

function connectTo(port) {
  return new Promise((resolve, reject) => {
    const connection = createConnection(port, "127.0.0.1");

    connection.once("connect", () => connection.end(resolve));
    connection.once("error", reject);
  });
}
