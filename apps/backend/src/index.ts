import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { readBackendConfig } from "./config.js";

const app = createApp({ config: readBackendConfig() });

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3000),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
