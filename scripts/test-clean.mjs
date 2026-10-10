import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  smokeKeyDirectoryPrefix,
  smokeKeyFileName,
  testProjectPrefixes,
} from "./lib/docker-test-stack.mjs";

// Removes Docker resources that interrupted test runs left behind. It never
// touches the development stack, images, or S3. Do not run it while a Docker
// test is running: it removes that run's stack too.
const isTestResource = (name) =>
  testProjectPrefixes.some((prefix) => name.startsWith(prefix));
let removed = 0;

for (const [kind, listArguments, removeArguments] of [
  ["container", ["ps", "--all", "--format", "{{.Names}}"], ["rm", "--force"]],
  ["network", ["network", "ls", "--format", "{{.Name}}"], ["network", "rm"]],
  ["volume", ["volume", "ls", "--format", "{{.Name}}"], ["volume", "rm"]],
]) {
  const names = docker(listArguments).split("\n").filter(isTestResource);
  if (!names.length) continue;
  docker([...removeArguments, ...names]);
  removed += names.length;
  console.log(`Removed ${kind}s:\n  ${names.join("\n  ")}`);
}
if (!removed) console.log("No leftover test Docker resources.");

for (const entry of await readdir(tmpdir())) {
  if (!entry.startsWith(smokeKeyDirectoryPrefix)) continue;
  const smokeKeyFile = path.join(tmpdir(), entry, smokeKeyFileName);
  const keys = await readFile(smokeKeyFile, "utf8").catch(() => "");
  if (keys.trim()) {
    console.log(
      `Live S3 smoke keys may remain in S3; check the keys listed in ${smokeKeyFile}.`,
    );
  }
}

function docker(arguments_) {
  const result = spawnSync("docker", arguments_, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(
      `docker ${arguments_.join(" ")} failed: ${(result.stderr || result.error?.message || "").trim()}`,
    );
  }
  return result.stdout.trim();
}
