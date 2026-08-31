import "dotenv/config";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDataDatabase, requireDatabaseUrl } from "./database.js";

const { database, pool } = createDataDatabase(requireDatabaseUrl());
const migrationsFolder = path.resolve(
  process.cwd(),
  process.env.MIGRATIONS_FOLDER ?? "drizzle",
);

try {
  const result = await migrate(database, {
    migrationsFolder,
  });

  if (result) {
    throw new Error(`Migration initialization failed: ${result.exitCode}`);
  }

  console.log("Drizzle migrations applied.");
} finally {
  await pool.end();
}
