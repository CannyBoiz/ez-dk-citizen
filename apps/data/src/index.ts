import 'dotenv/config';

import { serve } from '@hono/node-server';
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { createDataDatabase, requireDatabaseUrl } from './db/database.js';

const app = new Hono();
const { database, pool } = createDataDatabase(requireDatabaseUrl());

app.get('/', (c) => {
  return c.text('Hello Hono!');
});

app.get('/health', async (c) => {
  await database.execute(sql`select 1`);
  return c.json({ status: 'ok' });
});

const server = serve(
  {
    fetch: app.fetch,
    port: 3000,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  });
}
