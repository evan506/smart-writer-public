/**
 * Mine golden eval scenarios from a project's real confirm/dismiss history.
 *
 * Opt-in ops script. Reads (read-only) the project's chapters + entity
 * suggestions and writes a golden JSON file the eval runner can consume.
 * Treat the output as POTENTIALLY SENSITIVE (it embeds manuscript text) — it is
 * written under the gitignored eval-reports/ tree; do not commit it.
 *
 * Usage:
 *   npx tsx scripts/ops/build-extraction-golden.ts --project=<projectId>
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../test-extraction/env";
import { loadGoldenFromProject } from "../../src/lib/services/extraction-eval/golden";
import type { Database } from "../../src/types/database.types";

const GOLDEN_DIR = path.resolve(__dirname, "../../eval-reports/golden");

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  loadLocalEnv();
  const projectId = argValue("project");
  if (!projectId) {
    console.error("Usage: tsx scripts/ops/build-extraction-golden.ts --project=<projectId>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Supabase env missing (NEXT_PUBLIC_SUPABASE_URL + a key).");
    process.exit(1);
  }

  const supabase = createClient<Database>(url, key);
  const scenarios = await loadGoldenFromProject(supabase, projectId);

  fs.mkdirSync(GOLDEN_DIR, { recursive: true });
  const outFile = path.join(GOLDEN_DIR, `golden-${projectId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(scenarios, null, 2), "utf8");

  console.log(`[golden] ${scenarios.length} scenario(s) -> ${outFile}`);
  const labeled = scenarios.reduce(
    (sum, s) => sum + s.shouldExtract.length + s.shouldNotExtract.length,
    0
  );
  console.log(`[golden] ${labeled} labeled names total`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
