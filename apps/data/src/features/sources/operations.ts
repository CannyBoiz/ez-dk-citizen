import type { CreateSourceRequest } from "@ez-dk-citizen/api-contracts";
import { asc } from "drizzle-orm";

import type { DataDatabase } from "../../db/database.js";
import { source } from "../../db/schema.js";

export async function createSource(
  database: DataDatabase,
  input: CreateSourceRequest,
) {
  const [created] = await database
    .insert(source)
    .values({
      url: input.url,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
    })
    .returning();
  if (!created) throw new Error("Source insert returned no row.");
  return toSource(created);
}

export async function listSources(database: DataDatabase) {
  const rows = await database.select().from(source).orderBy(asc(source.id));
  return { items: rows.map(toSource) };
}

function toSource(row: { id: number; url: string; publishedAt: Date | null }) {
  return {
    id: row.id,
    url: row.url,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}
