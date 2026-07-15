import { describe, expect, it } from "vitest";
import {
  buildScenarioBaselines,
  confirmRegression,
  detectRegressions,
  median,
  scenariosToReconfirm,
} from "@/lib/services/extraction-eval/regression";
import type { EvalRun, ScenarioResult } from "@/lib/services/extraction-eval/types";

function result(
  scenarioId: string,
  score: number,
  environmentFailure = false
): ScenarioResult {
  return {
    scenarioId,
    score,
    precision: 1,
    recall: 1,
    noiseRate: 0,
    tp: 1,
    fp: 0,
    fn: 0,
    falsePositives: [],
    falseNegatives: [],
    environmentFailure,
  };
}

function run(results: ScenarioResult[]): EvalRun {
  return {
    runId: "r",
    startedAt: "2026-06-14T00:00:00Z",
    tier: "full",
    results,
    aggregate: {
      scenarioCount: results.length,
      environmentFailures: 0,
      meanScore: 0,
      meanPrecision: 0,
      meanRecall: 0,
    },
  };
}

describe("median", () => {
  it("handles odd and even lengths", () => {
    expect(median([90, 80, 100])).toBe(90);
    expect(median([80, 100])).toBe(90);
    expect(median([])).toBe(0);
  });
});

describe("buildScenarioBaselines", () => {
  it("medians per scenario over the window, skipping environment failures", () => {
    const runs = [
      run([result("a", 90), result("b", 70)]),
      run([result("a", 100), result("b", 70, true)]),
      run([result("a", 80)]),
    ];
    const baselines = buildScenarioBaselines(runs, 7);
    expect(baselines.get("a")).toBe(90); // median(90,100,80)
    expect(baselines.get("b")).toBe(70); // env-failure 70 skipped → median(70)
  });

  it("only considers the last `window` runs", () => {
    const runs = [
      run([result("a", 10)]),
      run([result("a", 100)]),
      run([result("a", 100)]),
    ];
    expect(buildScenarioBaselines(runs, 2).get("a")).toBe(100);
  });
});

describe("detectRegressions", () => {
  const baselines = new Map([["a", 90]]);

  it("flags a product score drop beyond the threshold", () => {
    const flags = detectRegressions(run([result("a", 70)]), baselines, 10);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ scenarioId: "a", kind: "product", delta: -20 });
  });

  it("does not flag a drop within the threshold", () => {
    expect(detectRegressions(run([result("a", 85)]), baselines, 10)).toEqual([]);
  });

  it("classifies an environment failure separately, not as product", () => {
    const flags = detectRegressions(run([result("a", 0, true)]), baselines, 10);
    expect(flags[0].kind).toBe("environment");
  });

  it("does not flag scenarios without a baseline", () => {
    expect(detectRegressions(run([result("new", 0)]), baselines, 10)).toEqual([]);
  });
});

describe("scenariosToReconfirm", () => {
  it("returns only product-flagged scenario ids", () => {
    const ids = scenariosToReconfirm([
      { scenarioId: "a", baselineScore: 90, currentScore: 70, delta: -20, kind: "product" },
      { scenarioId: "b", baselineScore: 0, currentScore: 0, delta: 0, kind: "environment" },
    ]);
    expect(ids).toEqual(["a"]);
  });
});

describe("confirmRegression", () => {
  it("confirms when the drop reproduces in >= minReproductions runs", () => {
    const reruns = [result("a", 70), result("a", 72), result("a", 95)];
    expect(confirmRegression(90, reruns, 10, 2)).toBe(true);
  });

  it("does not confirm a one-off dip (likely LLM variance)", () => {
    const reruns = [result("a", 70), result("a", 92), result("a", 95)];
    expect(confirmRegression(90, reruns, 10, 2)).toBe(false);
  });

  it("ignores environment-failure reruns when counting reproductions", () => {
    const reruns = [result("a", 70), result("a", 0, true), result("a", 95)];
    // Only one valid reproduction → not confirmed at min 2.
    expect(confirmRegression(90, reruns, 10, 2)).toBe(false);
  });
});
