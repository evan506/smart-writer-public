// Pure distillation logic: turn the author's recent dismissals into proposed
// EXCLUDE_PATTERN rules. No DB, no LLM here — fully unit-testable.
//
// Safety posture (V3.2.1): distilled rules are PROPOSALS. They land DISABLED
// and only influence extraction after the author explicitly activates them.
// A rule that references an approved entity name is rejected outright (story
// content must never become a tool rule).

export interface DistillationCandidate {
  key?: string;
  text: string;
  evidence?: string[];
}

export interface PreparedRule {
  key: string;
  text: string;
  kind: "EXCLUDE_PATTERN";
  source: "DISTILLED";
  status: "DISABLED";
  evidence: string[];
}

export type RejectionReason =
  | "duplicate"
  | "references_approved_entity"
  | "empty"
  | "over_cap";

export interface PreparedDistillation {
  accepted: PreparedRule[];
  rejected: { text: string; reason: RejectionReason }[];
}

export const DEFAULT_DISTILLATION_CAP = 5;

/** Normalize a rule key for stable dedup (lowercase, collapse non-word). */
export function normalizeRuleKey(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

import { normalizeLooseName } from "../text-normalize";

/**
 * True if the rule text references any approved entity name. Such rules would
 * encode story content into a tool rule and are rejected.
 */
export function referencesApprovedEntity(
  text: string,
  approvedEntityNames: string[]
): boolean {
  const haystack = normalizeLooseName(text);
  for (const name of approvedEntityNames) {
    const needle = normalizeLooseName(name);
    if (needle.length >= 2 && haystack.includes(needle)) return true;
  }
  return false;
}

/**
 * Prepare distilled candidates into proposed (DISABLED) rules.
 * - drops empties,
 * - rejects rules referencing an approved entity name,
 * - dedups against existing keys and within the batch,
 * - caps the number of accepted proposals.
 */
export function prepareDistilledRules(
  candidates: DistillationCandidate[],
  opts: {
    approvedEntityNames: string[];
    existingKeys: Set<string>;
    cap?: number;
  }
): PreparedDistillation {
  const cap = opts.cap ?? DEFAULT_DISTILLATION_CAP;
  const accepted: PreparedRule[] = [];
  const rejected: { text: string; reason: RejectionReason }[] = [];
  const seen = new Set<string>(opts.existingKeys);

  for (const candidate of candidates) {
    const text = candidate.text?.trim() ?? "";
    if (!text) {
      rejected.push({ text: candidate.text ?? "", reason: "empty" });
      continue;
    }
    if (referencesApprovedEntity(text, opts.approvedEntityNames)) {
      rejected.push({ text, reason: "references_approved_entity" });
      continue;
    }
    const key = normalizeRuleKey(candidate.key?.trim() || text);
    if (!key) {
      rejected.push({ text, reason: "empty" });
      continue;
    }
    if (seen.has(key)) {
      rejected.push({ text, reason: "duplicate" });
      continue;
    }
    if (accepted.length >= cap) {
      rejected.push({ text, reason: "over_cap" });
      continue;
    }
    seen.add(key);
    accepted.push({
      key,
      text,
      kind: "EXCLUDE_PATTERN",
      source: "DISTILLED",
      status: "DISABLED",
      evidence: Array.isArray(candidate.evidence) ? candidate.evidence : [],
    });
  }

  return { accepted, rejected };
}
