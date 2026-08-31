import "dotenv/config";

import assert from "node:assert/strict";

import { asc } from "drizzle-orm";

import { createDataDatabase, requireDatabaseUrl } from "./database.js";
import { language } from "./schema.js";

const canonicalLanguages = [
  { code: "da", name: "Danish" },
  { code: "en", name: "English" },
  { code: "th", name: "Thai" },
];

const { database, pool } = createDataDatabase(requireDatabaseUrl());

try {
  const languages = await database
    .select({ code: language.code, name: language.name })
    .from(language)
    .orderBy(asc(language.code));

  assert.deepEqual(languages, canonicalLanguages);
  console.log("Migrated schema contains exactly the canonical Languages.");
} finally {
  await pool.end();
}
