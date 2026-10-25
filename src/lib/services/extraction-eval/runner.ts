// Eval orchestration. The expensive, non-deterministic extraction call is an
// injected dependency (`EvalExtractor`) so this orchestrator is fully unit-
// testable; the ops script provides the real LLM-backed extractor. Mirrors the
// V3.2.1 pattern of testing the orchestration with the LLM mocked out.

import { scoreScenario } from "./scoring";
import { computeAggregate } from "./store";
import type { EvalRun, GoldenScenario, ScenarioResult } from "./types";

export interface EvalExtractor {
  (chapterText: string): Promise<{
    names: string[];
    environmentFailure?: boolean;
    error?: string;
  }>;
}

export async function runEval(input: {
  scenarios: GoldenScenario[];
  tier: EvalRun["tier"];
  extract: EvalExtractor;
  runId: string;
  startedAt: string;
  gitSha?: string;
  beta?: number;
  /** Opt-in bounded eval; legacy callers keep continue-on-error semantics. */
  shouldStop?: () => string | undefined;
  stopOnFailure?: boolean;
}): Promise<EvalRun> {
  const results: ScenarioResult[] = [];

  let stopReason: string | undefined;
  for (const scenario of input.scenarios) {
    stopReason = input.shouldStop?.();
    if (stopReason) break;
    let extracted: Awaited<ReturnType<EvalExtractor>>;
    try {
      extracted = await input.extract(scenario.chapterText);
    } catch (err) {
      results.push(
        environmentFailureResult(
          scenario.id,
          err instanceof Error ? err.message : "extraction threw"
        )
      );
      if (input.stopOnFailure) { stopReason = results.at(-1)?.error || "extraction failed"; break; }
      continue;
    }

    if (extracted.environmentFailure) {
      results.push(environmentFailureResult(scenario.id, extracted.error));
      if (input.stopOnFailure) { stopReason = extracted.error || "extraction failed"; break; }
      continue;
    }

    const score = scoreScenario(scenario, extracted.names, input.beta);
    results.push({ scenarioId: scenario.id, environmentFailure: false, ...score });
  }

  return {
    runId: input.runId,
    startedAt: input.startedAt,
    gitSha: input.gitSha,
    tier: input.tier,
    results,
    ...((input.shouldStop || input.stopOnFailure) ? {
      status: (stopReason ? "aborted" : "completed") as "aborted" | "completed",
      stopReason,
      unexecutedScenarioIds: input.scenarios.slice(results.length).map((s) => s.id),
    } : {}),
    aggregate: computeAggregate(results),
  };
}

function environmentFailureResult(
  scenarioId: string,
  error?: string
): ScenarioResult {
  return {
    scenarioId,
    score: 0,
    precision: 0,
    recall: 0,
    noiseRate: 0,
    tp: 0,
    fp: 0,
    fn: 0,
    falsePositives: [],
    falseNegatives: [],
    environmentFailure: true,
    error,
  };
}
