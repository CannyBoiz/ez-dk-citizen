import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { readBackendConfig } from "./config.js";

const { app, data } = createApp({ config: readBackendConfig() });

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
      void data.close().finally(() => process.exit(0));
    });
  });
}
