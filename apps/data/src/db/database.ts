import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { schemaRelations } from "./schema.js";

export function requireDatabaseUrl(environment = process.env): string {
  const databaseUrl = environment.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  return databaseUrl;
}

export function createDataDatabase(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const database = drizzle({ client: pool, relations: schemaRelations });

  return { database, pool };
}
