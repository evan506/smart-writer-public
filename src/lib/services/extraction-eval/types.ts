// Offline extraction-quality eval harness (SW-P1).
//
// Philosophy reference (Thinkly quality/regression harness), Smart-Writer-shaped:
// measure entity-extraction quality against a golden set built from the author's
// real confirm/dismiss decisions, persist runs, and detect regressions with a
// rolling baseline + re-confirmation. Scoring is precision-weighted on purpose,
// so an extractor that grabs everything (reward-hacking "acceptance rate") scores
// WORSE, not better — encoding the product's "few but accurate" value.

export interface GoldenScenario {
  id: string;
  // Source provenance (e.g. "project:<id> chapter:<num>") for debugging/mining.
  source: string;
  chapterText: string;
  // Names the author CONFIRMED — the extractor should surface these.
  shouldExtract: string[];
  // Names the author DISMISSED — the extractor should NOT surface these.
  shouldNotExtract: string[];
}

export interface ScenarioScore {
  score: number; // 0–100, precision-weighted F-beta(0.5)
  precision: number; // 0–1 over labeled names
  recall: number; // 0–1 over confirmed names
  noiseRate: number; // FP / (TP + FP)
  tp: number;
  fp: number;
  fn: number;
  falsePositives: string[]; // dismissed names the extractor wrongly surfaced
  falseNegatives: string[]; // confirmed names the extractor missed
}

export interface ScenarioResult extends ScenarioScore {
  scenarioId: string;
  // True when extraction failed to run (LLM/API error or empty output on a
  // non-empty scenario) — separated so environment failures never count as a
  // product-quality regression (Thinkly P4.2 failure taxonomy).
  environmentFailure: boolean;
  error?: string;
}

export interface EvalRun {
  runId: string;
  startedAt: string;
  gitSha?: string;
  tier: "smoke" | "standard" | "full";
  results: ScenarioResult[];
  // Aggregate over non-environment-failure results.
  aggregate: {
    scenarioCount: number;
    environmentFailures: number;
    meanScore: number;
    meanPrecision: number;
    meanRecall: number;
  };
}

export interface RegressionFlag {
  scenarioId: string;
  baselineScore: number;
  currentScore: number;
  delta: number; // currentScore - baselineScore (negative = regression)
  kind: "product" | "environment";
}
