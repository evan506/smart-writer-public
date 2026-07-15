// Single source of truth for name normalization. Three strategies exist on
// purpose — pick by what "same name" should mean at the call site. Behavior
// is pinned by tests/unit/lib/services/text-normalize.test.ts; changing any
// of these changes dedup/merge/matching semantics across the app.

/**
 * Strict entity-name identity: whitespace removed, lowercased.
 * "검은 서고" === "검은서고". Used for candidate filtering, substring merges,
 * and alias matching in the extraction pipeline.
 */
export function normalizeEntityName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

const LOOSE_STRIP = /[\s\p{P}\p{S}]+/gu;

/**
 * Loose comparison for scoring/guarding: NFKC-folded, lowercased, and all
 * whitespace/punctuation/symbols removed. "재의 연대기!" === "재의연대기".
 * Used by the extraction eval scorer and distillation entity-reference guard,
 * where over-matching is safer than under-matching.
 */
export function normalizeLooseName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(LOOSE_STRIP, "");
}
