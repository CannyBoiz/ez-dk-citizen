import { constants } from "node:os";

// `pnpm test:clean` removes Docker resources whose names start with these.
export const testProjectPrefixes = [
  "ez-dk-citizen-integration-",
  "ez-dk-citizen-development-test-",
  "ez-dk-citizen-roles-anywhere-",
  "ez-dk-live-s3-",
];

// The live S3 test lists its smoke keys in a temp folder named with this prefix,
// so `pnpm test:clean` can point at keys an interrupted run left in S3.
export const smokeKeyDirectoryPrefix = "ez-dk-live-s3-";
export const smokeKeyFileName = "smoke-keys";

const handledSignals = ["SIGINT", "SIGTERM", "SIGHUP"];

export function createProjectName(prefix) {
  if (!testProjectPrefixes.includes(prefix)) {
    throw new Error(`Unknown test project prefix: ${prefix}`);
  }
  return `${prefix}${process.pid}-${Date.now().toString(36)}`;
}

// Runs `teardown` exactly once: after `body` passes, after it fails, or when
// SIGINT/SIGTERM/SIGHUP arrives. A second signal during teardown exits at once.
export async function withTeardown(body, teardown, { interruptedHint } = {}) {
  let teardownRun;
  let interruptedBy;
  const runTeardown = () => {
    teardownRun ??= Promise.resolve().then(teardown);
    return teardownRun;
  };
  const onSignal = (signal) => {
    const exitCode = 128 + constants.signals[signal];
    if (interruptedBy) {
      console.error(
        [
          `Received ${signal} again; teardown aborted. Run \`pnpm test:clean\` to remove leftover Docker resources.`,
          interruptedHint,
        ]
          .filter(Boolean)
          .join(" "),
      );
      process.exit(exitCode);
    }
    interruptedBy = signal;
    console.error(`Received ${signal}; tearing down. Send it again to abort.`);
    runTeardown()
      .catch((error) => console.error(error))
      .finally(() => process.exit(exitCode));
  };
  for (const signal of handledSignals) process.on(signal, onSignal);

  let failure;
  try {
    await body();
  } catch (error) {
    failure = error;
  }
  try {
    await runTeardown();
  } catch (error) {
    failure = failure
      ? new AggregateError(
          [failure, error],
          "The test failed and its teardown also failed.",
        )
      : error;
  }
  // The signal handler reports the teardown result and exits.
  if (interruptedBy) await new Promise(() => {});
  for (const signal of handledSignals) process.off(signal, onSignal);
  if (failure) throw failure;
}
