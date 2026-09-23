import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const projectName = `ez-dk-citizen-roles-anywhere-${process.pid}-${Date.now().toString(36)}`;
const preflightOnly = process.argv.includes("--preflight");
const configFile = runtimeFile("AWS_ROLES_ANYWHERE_CONFIG_FILE", "config");
const certificateFile = runtimeFile(
  "AWS_ROLES_ANYWHERE_CERTIFICATE_FILE",
  "workload.crt",
);
const privateKeyFile = runtimeFile(
  "AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE",
  "workload.key",
);
const awsRegion = process.env.AWS_REGION;
const s3Bucket = process.env.S3_BUCKET;
if (!awsRegion) throw new Error("AWS_REGION is required for this smoke test.");
if (!s3Bucket) throw new Error("S3_BUCKET is required for this smoke test.");

await requireFile(configFile);
await requireFile(certificateFile);
const privateKey = await stat(privateKeyFile).catch(() => undefined);
if (!privateKey) {
  throw new Error(`Roles Anywhere private key is missing: ${privateKeyFile}`);
}
assert.equal(
  privateKey.mode & 0o777,
  0o600,
  `Roles Anywhere private key must have mode 0600: ${privateKeyFile}`,
);

const composeEnvironment = {
  ...process.env,
  ADMIN_API_TOKEN:
    process.env.ADMIN_API_TOKEN ?? "roles-anywhere-smoke-admin-token",
  DATA_SERVICE_TOKEN:
    process.env.DATA_SERVICE_TOKEN ?? "roles-anywhere-smoke-data-service-token",
  POSTGRES_DB: "roles_anywhere_smoke",
  POSTGRES_USER: "roles_anywhere_smoke",
  POSTGRES_PASSWORD: "roles-anywhere-smoke-password",
  AWS_REGION: awsRegion,
  S3_BUCKET: s3Bucket,
  AWS_ROLES_ANYWHERE_CONFIG_FILE: configFile,
  AWS_ROLES_ANYWHERE_CERTIFICATE_FILE: certificateFile,
  AWS_ROLES_ANYWHERE_PRIVATE_KEY_FILE: privateKeyFile,
};
delete composeEnvironment.AWS_ACCESS_KEY_ID;
delete composeEnvironment.AWS_SECRET_ACCESS_KEY;

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

await runDocker([...composeArguments, "config", "--quiet"]);
const config = JSON.parse(
  (
    await runDocker([...composeArguments, "config", "--format", "json"], {
      captureOutput: true,
    })
  ).output,
);
assertTopology(config);

let failure;
try {
  await runDocker([
    ...composeArguments,
    "up",
    "--detach",
    "--build",
    "--wait",
    "--wait-timeout",
    "120",
    "bff",
  ]);
  await assertImageContents();
  await assertPrivateKeyReadable();
  if (preflightOnly) {
    console.log(
      "Container preflight passed; STS identity exchange was skipped.",
    );
  } else {
    await assertIdentity();
  }
  await assertLegacyVariableRejected("AWS_ACCESS_KEY_ID");
  await assertLegacyVariableRejected("AWS_SECRET_ACCESS_KEY");
} catch (error) {
  failure = error;
} finally {
  try {
    await runDocker([
      ...composeArguments,
      "down",
      "--volumes",
      "--remove-orphans",
    ]);
  } catch (cleanupError) {
    failure ??= cleanupError;
  }
}

if (failure) throw failure;
console.log(
  preflightOnly
    ? "Roles Anywhere container preflight passed."
    : "Roles Anywhere container smoke test passed.",
);

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

function assertTopology(composeConfig) {
  const bff = composeConfig.services.bff;
  assert.equal(bff.environment.AWS_PROFILE, "roles-anywhere");
  assert.equal(
    bff.environment.AWS_CONFIG_FILE,
    "/run/ez-dk-citizen/aws/config",
  );
  assert.equal(bff.environment.AWS_ACCESS_KEY_ID, undefined);
  assert.equal(bff.environment.AWS_SECRET_ACCESS_KEY, undefined);

  const mounts = new Map(bff.volumes.map((volume) => [volume.target, volume]));
  for (const target of [
    "/run/ez-dk-citizen/aws/config",
    "/run/ez-dk-citizen/identity/workload.crt",
    "/run/ez-dk-citizen/identity/workload.key",
  ]) {
    assert.equal(
      mounts.get(target)?.read_only,
      true,
      `${target} is not read-only`,
    );
  }

  for (const name of ["POSTGRES_DB", "POSTGRES_USER", "POSTGRES_PASSWORD"]) {
    assert.ok(composeConfig.services.postgres.environment[name]);
  }

  for (const name of ["postgres", "migrate", "hono-data"]) {
    const service = composeConfig.services[name];
    assert.equal(service.environment.AWS_PROFILE, undefined);
    assert.equal(service.volumes?.length ?? 0, name === "postgres" ? 1 : 0);
  }
}

async function assertIdentity() {
  const output = await runDocker(
    [
      ...composeArguments,
      "exec",
      "-T",
      "bff",
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

async function assertPrivateKeyReadable() {
  await runDocker([
    ...composeArguments,
    "exec",
    "-T",
    "bff",
    "node",
    "--input-type=module",
    "-e",
    'import { accessSync, constants } from "node:fs"; accessSync("/run/ez-dk-citizen/identity/workload.key", constants.R_OK);',
  ]);
}

async function assertLegacyVariableRejected(name) {
  const result = await runDocker(
    [
      ...composeArguments,
      "run",
      "--no-deps",
      "--rm",
      "-e",
      `${name}=stale-key`,
      "bff",
    ],
    { captureOutput: true, allowFailure: true },
  );
  assert.notEqual(result.exitCode, 0);
  assert.match(result.output, new RegExp(`${name} must not be set`));
}

async function assertImageContents() {
  const image = JSON.parse(
    (
      await runDocker(["image", "inspect", "ez-dk-citizen-bff:local"], {
        captureOutput: true,
      })
    ).output,
  )[0];
  assert.equal(image.Config.User, "node");
  assert.equal(
    image.Config.Env.some((value) =>
      /AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY)=/.test(value),
    ),
    false,
  );
  await runDocker([
    "run",
    "--rm",
    "--entrypoint",
    "sh",
    "ez-dk-citizen-bff:local",
    "-ec",
    "test -x /usr/local/bin/aws_signing_helper; test ! -e /run/ez-dk-citizen/aws/config; test ! -e /run/ez-dk-citizen/identity/workload.crt; test ! -e /run/ez-dk-citizen/identity/workload.key; test ! -e /app/runtime; test ! -e /app/extra-files",
  ]);
}

function runDocker(arguments_, options = {}) {
  const { captureOutput = false, allowFailure = false } = options;
  return new Promise((resolve, reject) => {
    const child = spawn("docker", arguments_, {
      cwd: repositoryRoot,
      env: composeEnvironment,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let output = "";
    let errorOutput = "";
    child.stdout?.on("data", (chunk) => (output += chunk));
    child.stderr?.on("data", (chunk) => (errorOutput += chunk));
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      const result = {
        exitCode: code ?? 1,
        output: `${errorOutput}\n${output}`.trim(),
      };
      if (result.exitCode === 0 || allowFailure) {
        resolve(result);
        return;
      }
      reject(
        new Error(
          `docker ${arguments_.join(" ")} failed with ${signal ?? `exit code ${code}`}: ${result.output}`,
        ),
      );
    });
  });
}
