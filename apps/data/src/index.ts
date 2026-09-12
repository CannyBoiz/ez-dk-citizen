import { serve } from "@hono/node-server";
import { sql } from "drizzle-orm";

import { createDataApp } from "./app.js";
import { createDataDatabase, requireDatabaseUrl } from "./db/database.js";

if (!process.env.DATA_SERVICE_TOKEN) {
  throw new Error("DATA_SERVICE_TOKEN is required.");
}

const { database, pool } = createDataDatabase(requireDatabaseUrl());
const app = createDataApp(
  async () => {
    await database.execute(sql`select 1`);
  },
  { database, dataServiceToken: process.env.DATA_SERVICE_TOKEN },
);

const server = serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3000),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  });
}
