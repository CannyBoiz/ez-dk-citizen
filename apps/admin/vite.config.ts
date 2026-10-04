import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Only VITE_BFF_BASE_URL reaches the bundle; ADMIN_API_TOKEN is typed in at runtime.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  test: { environment: "jsdom" },
});
