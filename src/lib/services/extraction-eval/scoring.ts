// Pure scoring. Precision-weighted on purpose: F-beta with beta < 1 favors
// precision, so surfacing a name the author dismissed (a false positive) hurts
// more than missing one. This makes "extract everything" a LOSING strategy and
// defends the eval against reward-hacking toward raw acceptance counts.

import type { GoldenScenario, ScenarioScore } from "./types";

// beta < 1 weights precision over recall. 0.5 => precision counts ~4x recall.
export const PRECISION_BETA = 0.5;

import { normalizeLooseName } from "../text-normalize";

export function normalizeName(name: string): string {
  return normalizeLooseName(name);
}

function normalizedSet(names: string[]): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    const norm = normalizeName(name);
    if (norm) set.add(norm);
  }
  return set;
}

function fBeta(precision: number, recall: number, beta: number): number {
  const b2 = beta * beta;
  const denom = b2 * precision + recall;
  if (denom === 0) return 0;
  return ((1 + b2) * precision * recall) / denom;
}

/**
 * Score one extraction against a golden scenario.
 *
 * - TP: extracted ∩ shouldExtract (good)
 * - FP: extracted ∩ shouldNotExtract (surfaced a dismissed name — noise)
 * - FN: shouldExtract \ extracted (missed a confirmed name)
 *
 * Names not present in either golden list are "unlabeled" and ignored — the
 * golden set only judges decisions the author actually made.
 */
export function scoreScenario(
  scenario: Pick<GoldenScenario, "shouldExtract" | "shouldNotExtract">,
  extractedNames: string[],
  beta: number = PRECISION_BETA
): ScenarioScore {
  const extracted = normalizedSet(extractedNames);
  const good = normalizedSet(scenario.shouldExtract);
  const bad = normalizedSet(scenario.shouldNotExtract);

  const tpNames: string[] = [];
  const fpNames: string[] = [];
  for (const name of extracted) {
    if (good.has(name)) tpNames.push(name);
    else if (bad.has(name)) fpNames.push(name);
  }
  const fnNames: string[] = [];
  for (const name of good) {
    if (!extracted.has(name)) fnNames.push(name);
  }

  const tp = tpNames.length;
  const fp = fpNames.length;
  const fn = fnNames.length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 1;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 1;
  const noiseRate = tp + fp > 0 ? fp / (tp + fp) : 0;
  const score = Math.round(100 * fBeta(precision, recall, beta));

  return {
    score,
    precision,
    recall,
    noiseRate,
    tp,
    fp,
    fn,
    falsePositives: fpNames,
    falseNegatives: fnNames,
  };
}

/** Mean of a numeric list, 0 for empty. */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
