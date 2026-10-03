import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { readBffConfig } from "./config.js";

const app = createApp({ config: readBffConfig() });

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3000),
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);
