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
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/integration/**", "tests/e2e/**", "node_modules/**", ".next/**"],
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      thresholds: {
        "src/hooks/use-autosave.ts": {
          statements: 80,
          branches: 60,
          functions: 65,
          lines: 85,
        },
        "src/app/(dashboard)/projects/[id]/codex-action-forms.ts": {
          statements: 78,
          branches: 55,
          functions: 80,
          lines: 78,
        },
        "src/app/(dashboard)/projects/[id]/codex-actions.ts": {
          statements: 20,
          branches: 15,
          functions: 25,
          lines: 24,
        },
        "src/lib/services/codex/entity-mutation.service.ts": {
          statements: 80,
          branches: 60,
          functions: 90,
          lines: 90,
        },
        "src/lib/services/codex/link-mutation.service.ts": {
          statements: 85,
          branches: 75,
          functions: 100,
          lines: 85,
        },
      },
    },
  },
});
