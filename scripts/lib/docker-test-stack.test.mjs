import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";

import { withTeardown } from "./docker-test-stack.mjs";

test("runs the teardown once after the body passes", async () => {
  let teardowns = 0;
  await withTeardown(
    async () => {},
    () => {
      teardowns += 1;
    },
  );
  assert.equal(teardowns, 1);
});

test("runs the teardown once and keeps the error when the body fails", async () => {
  let teardowns = 0;
  const bodyError = new Error("body failed");
  await assert.rejects(
    withTeardown(
      async () => {
        throw bodyError;
      },
      () => {
        teardowns += 1;
      },
    ),
    bodyError,
  );
  assert.equal(teardowns, 1);
});

test("runs the teardown once on SIGINT and exits with code 130", async () => {
  const helper = new URL("./docker-test-stack.mjs", import.meta.url).href;
  const child = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { withTeardown } from ${JSON.stringify(helper)};
await withTeardown(
  () => new Promise(() => { setInterval(() => {}, 1000); console.log("ready"); }),
  () => console.log("teardown"),
);`,
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    if (!output.includes("ready") && `${output}${chunk}`.includes("ready")) {
      child.kill("SIGINT");
    }
    output += chunk;
  });

  const [exitCode] = await once(child, "exit");
  assert.equal(exitCode, 130);
  assert.equal(output.match(/teardown/g)?.length, 1);
});
