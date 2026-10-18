import type {
  CreateSourceRequest,
  UpdateSourceRequest,
} from "@ez-dk-citizen/api-contracts";
import { asc, eq } from "drizzle-orm";

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

// A correction applies to every citing Lesson, whatever its status, and touches none of them.
export async function updateSource(
  database: DataDatabase,
  id: number,
  input: UpdateSourceRequest,
) {
  const [updated] = await database
    .update(source)
    .set({
      url: input.url,
      // Absent keeps the date and null clears it, as Drizzle leaves out undefined.
      publishedAt:
        input.publishedAt == null
          ? input.publishedAt
          : new Date(input.publishedAt),
    })
    .where(eq(source.id, id))
    .returning();
  return updated && toSource(updated);
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
