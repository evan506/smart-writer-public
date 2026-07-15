// Run persistence — file-first (no DB migration in this slice), mirroring
// Thinkly's evolution (file reports first, DB later). Reports are JSON files in
// a reports directory; the regression detector reads the last N back.

import fs from "node:fs";
import path from "node:path";
import { mean } from "./scoring";
import type { EvalRun, ScenarioResult } from "./types";

/** Pure aggregate over product results (environment failures excluded from means). */
export function computeAggregate(
  results: ScenarioResult[]
): EvalRun["aggregate"] {
  const product = results.filter((r) => !r.environmentFailure);
  return {
    scenarioCount: results.length,
    environmentFailures: results.length - product.length,
    meanScore: Math.round(mean(product.map((r) => r.score))),
    meanPrecision: Number(mean(product.map((r) => r.precision)).toFixed(4)),
    meanRecall: Number(mean(product.map((r) => r.recall)).toFixed(4)),
  };
}

function reportFileName(run: EvalRun): string {
  // Sortable by name: startedAt is ISO, so lexicographic == chronological.
  const safeStarted = run.startedAt.replace(/[:.]/g, "-");
  return `run-${safeStarted}-${run.runId}.json`;
}

/** Write a run report as JSON, returning the file path. */
export function writeRunReport(reportsDir: string, run: EvalRun): string {
  fs.mkdirSync(reportsDir, { recursive: true });
  const filePath = path.join(reportsDir, reportFileName(run));
  fs.writeFileSync(filePath, JSON.stringify(run, null, 2), "utf8");
  return filePath;
}

/**
 * Load prior runs (oldest -> newest) from the reports directory. Malformed
 * files are skipped rather than aborting the run.
 */
export function loadPriorRuns(reportsDir: string, limit?: number): EvalRun[] {
  if (!fs.existsSync(reportsDir)) return [];
  const files = fs
    .readdirSync(reportsDir)
    .filter((f) => f.startsWith("run-") && f.endsWith(".json"))
    .sort();

  const selected = limit ? files.slice(-limit) : files;
  const runs: EvalRun[] = [];
  for (const file of selected) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(reportsDir, file), "utf8")
      ) as EvalRun;
      if (parsed && Array.isArray(parsed.results)) runs.push(parsed);
    } catch {
      // skip malformed report
    }
  }
  return runs;
}
