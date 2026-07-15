import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/integration/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/unit/**", "tests/e2e/**", "node_modules/**", ".next/**"],
    passWithNoTests: true,
    testTimeout: 30_000,
  },
});
