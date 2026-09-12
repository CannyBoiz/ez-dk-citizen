import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

test("loads the repository .env from the Data Service workspace", async () => {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), "data-env-"));
  const dataWorkspace = path.join(repositoryRoot, "apps/data");
  const originalDirectory = process.cwd();

  mkdirSync(dataWorkspace, { recursive: true });
  writeFileSync(path.join(repositoryRoot, ".env"), "DATABASE_URL=fixture\n");
  process.chdir(dataWorkspace);
  delete process.env.DATABASE_URL;
  delete process.env.DOTENV_CONFIG_PATH;

  try {
    await import("./load-environment.js");
    assert.equal(process.env.DATABASE_URL, "fixture");
  } finally {
    process.chdir(originalDirectory);
    rmSync(repositoryRoot, { recursive: true });
  }
});
