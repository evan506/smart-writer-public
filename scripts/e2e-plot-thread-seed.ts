/**
 * CLI for the V3.3 plot-thread matrix live MCP-Playwright smoke.
 *
 *   npx tsx scripts/e2e-plot-thread-seed.ts            # seed, prints JSON
 *   npx tsx scripts/e2e-plot-thread-seed.ts --cleanup <projectId> <userId>
 *
 * Honors the same remote guard as the Playwright suite: requires
 * SMART_WRITER_AUTH_E2E_TESTS=1, and for a non-local Supabase URL also
 * ALLOW_REMOTE_AUTH_E2E_TESTS=1. Never bypasses auth.
 */
import {
  loadEnvLocal,
  seedPlotThreadE2E,
  cleanupPlotThreadE2E,
  type PlotThreadE2EEnv,
} from "../tests/e2e/helpers/plot-thread-seed";

function isLocalUrl(url: string) {
  return (
    url.includes("127.0.0.1") ||
    url.includes("localhost") ||
    url.includes("host.docker.internal")
  );
}

function resolveEnv(): PlotThreadE2EEnv {
  if (process.env.SMART_WRITER_AUTH_E2E_TESTS !== "1") {
    throw new Error("SMART_WRITER_AUTH_E2E_TESTS=1 is required");
  }
  const url =
    process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_TEST_URL/NEXT_PUBLIC_SUPABASE_URL and a service-role key are required"
    );
  }
  if (!isLocalUrl(url) && process.env.ALLOW_REMOTE_AUTH_E2E_TESTS !== "1") {
    throw new Error(
      "Refusing remote Supabase writes without ALLOW_REMOTE_AUTH_E2E_TESTS=1"
    );
  }
  return { url, serviceKey };
}

async function main() {
  loadEnvLocal();
  const env = resolveEnv();
  const args = process.argv.slice(2);

  if (args[0] === "--cleanup") {
    const [, projectId, userId] = args;
    await cleanupPlotThreadE2E(env, { projectId, userId });
    console.log(JSON.stringify({ cleaned: { projectId, userId } }));
    return;
  }

  const seed = await seedPlotThreadE2E(env);
  console.log(JSON.stringify(seed, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
