/**
 * Extraction-quality eval harness runner (SW-P1).
 *
 * Opt-in, NON-BILLABLE, NOT part of CI/build. Runs the live extraction LLM
 * (needs OPENROUTER_API_KEY) over golden scenarios, scores precision-weighted,
 * persists a JSON run report, and checks for regressions against the rolling
 * baseline (re-confirming flagged scenarios before declaring a product drop).
 *
 * Usage:
 *   npx tsx scripts/ops/run-extraction-eval.ts --tier=smoke
 *   npx tsx scripts/ops/run-extraction-eval.ts --tier=full --golden=eval-reports/golden/<file>.json
 *
 * Reports: eval-reports/extraction/ (gitignored).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "../test-extraction/env";
import { STARTER_GOLDEN_SCENARIOS } from "../../src/lib/services/extraction-eval/fixtures";
import { runEval, type EvalExtractor } from "../../src/lib/services/extraction-eval/runner";
import { writeRunReport, loadPriorRuns } from "../../src/lib/services/extraction-eval/store";
import {
  buildScenarioBaselines,
  detectRegressions,
  scenariosToReconfirm,
  confirmRegression,
  DEFAULT_RECONFIRM_RUNS,
} from "../../src/lib/services/extraction-eval/regression";
import type {
  GoldenScenario,
  ScenarioResult,
} from "../../src/lib/services/extraction-eval/types";

const REPORTS_DIR = path.resolve(__dirname, "../../eval-reports/extraction");

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function gitSha(): string | undefined {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return undefined;
  }
}

function loadScenarios(): GoldenScenario[] {
  const goldenFile = argValue("golden");
  // An explicit --golden file is used as-is (the named golden set).
  if (goldenFile && fs.existsSync(goldenFile)) {
    return JSON.parse(fs.readFileSync(goldenFile, "utf8")) as GoldenScenario[];
  }
  // No golden file: starter fixtures (smoke and full alike, until a set is mined).
  return STARTER_GOLDEN_SCENARIOS;
}

/** DB-write-free extractor: stage1 nouns -> stage2 classify -> names. */
async function buildExtractor(guidanceBlock = ""): Promise<EvalExtractor> {
  const { stage1ExtractNouns, stage2Classify } = await import(
    "../../src/lib/services/entity-extraction/stage-llm-wrappers.ts"
  );
  const opts = guidanceBlock ? { guidanceBlock } : {};
  return async (chapterText: string) => {
    const candidates = await stage1ExtractNouns(chapterText, [], opts);
    if (candidates.length === 0) return { names: [] };
    const classified = await stage2Classify(candidates, chapterText, [], opts);
    return { names: classified.map((c: { name: string }) => c.name) };
  };
}

async function main() {
  loadLocalEnv();
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY missing — eval needs the live extraction LLM.");
    process.exit(1);
  }

  const tier = (argValue("tier") ?? "smoke") as "smoke" | "standard" | "full";
  const reconfirmRuns = Number(argValue("reconfirm") ?? DEFAULT_RECONFIRM_RUNS);
  const limit = argValue("limit") ? Number(argValue("limit")) : null;
  const guidance = argValue("guidance") ?? "";
  const allScenarios = loadScenarios();
  const scenarios = limit ? allScenarios.slice(0, limit) : allScenarios;
  console.log(
    `[eval] tier=${tier} scenarios=${scenarios.length}${guidance ? " (guidance injected)" : ""}`
  );

  // Preflight: confirm the LLM is reachable BEFORE scoring. Without this, an
  // environment failure (out of credits / auth) makes every extraction return
  // empty, which the scorer reads as score 0 and can "confirm" as a fake
  // product regression — poisoning the baseline. Observed live 2026-06-14
  // (OpenRouter 402 mid-run). Abort without writing a report instead.
  const { callLLM } = await import("../../src/lib/services/llm.service.ts");
  try {
    await callLLM({ system: "Reply with OK.", user: "OK", maxTokens: 5, temperature: 0 });
  } catch (err) {
    console.error(
      `[eval] preflight LLM check failed — environment issue, aborting without writing a report: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    process.exit(3);
  }

  const extract = await buildExtractor(guidance);
  const startedAt = new Date().toISOString();
  const runId = Math.random().toString(36).slice(2, 10);

  const run = await runEval({
    scenarios,
    tier,
    extract,
    runId,
    startedAt,
    gitSha: gitSha(),
  });

  const reportPath = writeRunReport(REPORTS_DIR, run);
  console.log(`[eval] wrote ${reportPath}`);
  console.log(
    `[eval] meanScore=${run.aggregate.meanScore} meanPrecision=${run.aggregate.meanPrecision} ` +
      `meanRecall=${run.aggregate.meanRecall} envFailures=${run.aggregate.environmentFailures}`
  );

  // Regression check vs prior runs (current run excluded from its own baseline).
  const prior = loadPriorRuns(REPORTS_DIR).filter((r) => r.runId !== runId);
  const baselines = buildScenarioBaselines(prior);
  const flags = detectRegressions(run, baselines);
  const productFlags = flags.filter((f) => f.kind === "product");

  if (productFlags.length === 0) {
    console.log("[eval] no product regressions flagged.");
    return;
  }

  console.log(`[eval] ${productFlags.length} scenario(s) flagged — re-confirming ${reconfirmRuns}x...`);
  const toReconfirm = new Set(scenariosToReconfirm(flags));
  const confirmed: string[] = [];

  for (const flag of productFlags) {
    if (!toReconfirm.has(flag.scenarioId)) continue;
    const scenario = scenarios.find((s) => s.id === flag.scenarioId);
    if (!scenario) continue;
    const reRuns: ScenarioResult[] = [];
    for (let i = 0; i < reconfirmRuns; i++) {
      const r = await runEval({
        scenarios: [scenario],
        tier,
        extract,
        runId: `${runId}-rc${i}`,
        startedAt: new Date().toISOString(),
      });
      reRuns.push(r.results[0]);
    }
    if (confirmRegression(flag.baselineScore, reRuns)) {
      confirmed.push(flag.scenarioId);
      console.log(
        `[eval] CONFIRMED regression ${flag.scenarioId}: baseline=${flag.baselineScore} current=${flag.currentScore}`
      );
    } else {
      console.log(`[eval] flag ${flag.scenarioId} did not reproduce (likely LLM variance).`);
    }
  }

  if (confirmed.length > 0) {
    console.error(`[eval] ${confirmed.length} confirmed product regression(s): ${confirmed.join(", ")}`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
