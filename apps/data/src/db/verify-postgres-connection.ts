import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to verify PostgreSQL connectivity.');
}

const pool = new Pool({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5_000,
});

try {
  const database = drizzle({ client: pool });
  const result = await database.execute<{ connected: number }>(
    sql`select 1::integer as connected`,
  );

  if (result.rows[0]?.connected !== 1) {
    throw new Error('PostgreSQL returned an unexpected connection-check result.');
  }

  console.log('Drizzle connected to PostgreSQL.');
} finally {
  await pool.end();
}
