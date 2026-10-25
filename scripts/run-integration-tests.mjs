import { spawnSync } from "node:child_process";

if (process.env.SMART_WRITER_INTEGRATION_TESTS !== "1") {
  console.error(
    "DB integration tests require SMART_WRITER_INTEGRATION_TESTS=1. " +
      "For the complete local run, use: bash scripts/ci/run-db-backed-integration.sh",
  );
  process.exit(1);
}

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(
  pnpmCommand,
  [
    "exec",
    "vitest",
    "run",
    "--config",
    "vitest.integration.config.mts",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
