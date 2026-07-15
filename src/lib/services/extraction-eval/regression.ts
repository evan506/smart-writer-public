// Pure regression detection, mirroring Thinkly's quality-regression detector
// (rolling baseline + flag + re-confirmation), Smart-Writer-shaped.
//
// Two safety properties carried over from Thinkly P4.2:
//  1. environment failures (LLM/API errors) are classified separately and never
//     count as a product-quality regression;
//  2. a flag is only actionable after re-running the flagged scenario a few
//     times and reproducing the drop (defends against LLM run-to-run variance).

import type { EvalRun, RegressionFlag, ScenarioResult } from "./types";

export const DEFAULT_BASELINE_WINDOW = 7;
export const DEFAULT_SCORE_DROP_THRESHOLD = 10;
export const DEFAULT_RECONFIRM_RUNS = 3;
export const DEFAULT_MIN_REPRODUCTIONS = 2;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Per-scenario baseline = median score across the last `window` runs, counting
 * only product results (environment failures are skipped so an API outage does
 * not poison the baseline).
 */
export function buildScenarioBaselines(
  priorRuns: EvalRun[],
  window: number = DEFAULT_BASELINE_WINDOW
): Map<string, number> {
  const recent = priorRuns.slice(-window);
  const scoresById = new Map<string, number[]>();

  for (const run of recent) {
    for (const result of run.results) {
      if (result.environmentFailure) continue;
      const list = scoresById.get(result.scenarioId) ?? [];
      list.push(result.score);
      scoresById.set(result.scenarioId, list);
    }
  }

  const baselines = new Map<string, number>();
  for (const [scenarioId, scores] of scoresById) {
    baselines.set(scenarioId, median(scores));
  }
  return baselines;
}

/**
 * Flag scenarios whose current score dropped >= threshold below baseline.
 * Environment failures are surfaced as `kind: "environment"` (informational,
 * non-blocking). Scenarios without a baseline yet are not flagged.
 */
export function detectRegressions(
  current: EvalRun,
  baselines: Map<string, number>,
  threshold: number = DEFAULT_SCORE_DROP_THRESHOLD
): RegressionFlag[] {
  const flags: RegressionFlag[] = [];

  for (const result of current.results) {
    const baseline = baselines.get(result.scenarioId);

    if (result.environmentFailure) {
      flags.push({
        scenarioId: result.scenarioId,
        baselineScore: baseline ?? 0,
        currentScore: result.score,
        delta: baseline === undefined ? 0 : result.score - baseline,
        kind: "environment",
      });
      continue;
    }

    if (baseline === undefined) continue;
    const delta = result.score - baseline;
    if (delta <= -threshold) {
      flags.push({
        scenarioId: result.scenarioId,
        baselineScore: baseline,
        currentScore: result.score,
        delta,
        kind: "product",
      });
    }
  }

  return flags;
}

/** Scenario ids that should be re-run to confirm a product regression. */
export function scenariosToReconfirm(flags: RegressionFlag[]): string[] {
  return flags
    .filter((flag) => flag.kind === "product")
    .map((flag) => flag.scenarioId);
}

/**
 * Confirm a flagged product regression from re-run results. The drop must
 * reproduce in at least `minReproductions` of the re-runs (a re-run still at or
 * below baseline - threshold counts as a reproduction). Environment-failure
 * re-runs do not count toward reproduction.
 */
export function confirmRegression(
  baselineScore: number,
  reRunResults: Pick<ScenarioResult, "score" | "environmentFailure">[],
  threshold: number = DEFAULT_SCORE_DROP_THRESHOLD,
  minReproductions: number = DEFAULT_MIN_REPRODUCTIONS
): boolean {
  let reproductions = 0;
  for (const result of reRunResults) {
    if (result.environmentFailure) continue;
    if (result.score - baselineScore <= -threshold) reproductions += 1;
  }
  return reproductions >= minReproductions;
}
