// Layered extraction memory (V3.2.1).
//
// These types describe how the EXTRACTION TOOL should behave for a given
// project — they never describe story content, canon, or facts.

export type MemoryLayer = "project" | "account" | "genre";

export type MemoryRuleKind = "EXCLUDE_PATTERN" | "TYPE_CONVENTION";

export type MemoryRuleSource = "DISTILLED" | "MANUAL" | "CURATED";

export interface MemoryRule {
  key: string;
  text: string;
  kind: MemoryRuleKind;
  layer: MemoryLayer;
  source: MemoryRuleSource;
}

// A genre-baseline rule as stored in genre_kits.rules[].extraction_conventions.
export interface GenreConventionRule {
  key: string;
  text: string;
}

export interface GenreExtractionConventions {
  excludePatterns: GenreConventionRule[];
  typeConventions: GenreConventionRule[];
}

// Per-layer counts shown in the transparency surface.
export interface AppliedMemorySummary {
  totalRules: number;
  byLayer: Record<MemoryLayer, number>;
  excludeNameCount: number;
  truncated: boolean;
}

export interface ExtractionMemory {
  // Exact-name exclusions (project excluded_terms). Kept distinct from
  // pattern rules so the panel can surface a per-name "제외 해제" action.
  excludeNames: string[];
  // Resolved pattern/type rules after layer precedence + overrides.
  rules: MemoryRule[];
  // Capped Korean text injected into extraction prompts.
  promptBlock: string;
  // Structured summary for the "이번 추출에 적용된 학습" surface.
  appliedSummary: AppliedMemorySummary;
}
