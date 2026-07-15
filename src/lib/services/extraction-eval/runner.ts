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
}): Promise<EvalRun> {
  const results: ScenarioResult[] = [];

  for (const scenario of input.scenarios) {
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
      continue;
    }

    if (extracted.environmentFailure) {
      results.push(environmentFailureResult(scenario.id, extracted.error));
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
