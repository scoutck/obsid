import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
    globalSetup: ["./tests/setup.ts"],
    fileParallelism: false,
    exclude: ["tests/e2e/**", "node_modules/**"],
    env: {
      DATABASE_URL: "file:./prisma/test.db",
      JWT_SECRET: "test-secret-at-least-32-chars-long",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
