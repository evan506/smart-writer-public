// Single source of truth for prompt template versions written to
// llm_usage_logs.prompt_template_version. Bump the version here whenever the
// corresponding template's rendered output changes — the guard test
// (tests/unit/lib/services/prompt-version-guard.test.ts) hashes canonical
// renders and fails if a template changed without a bump, so usage logs stay
// segmentable by prompt revision.

export const PROMPT_TEMPLATE_VERSIONS = {
  "entity_extraction.stage1_nouns": "v1-public-20261025",
  "entity_extraction.stage2_classify": "v2-public-20261025",
  "entity_extraction.stage3_relations": "v1",
  "analysis.chapter": "v1",
  canon_qna: "v3-public-20261025",
  "extraction_memory.distillation": "v1",
} as const;

export type PromptTemplateKey = keyof typeof PROMPT_TEMPLATE_VERSIONS;

export function getPromptTemplateVersion(key: PromptTemplateKey): string {
  return PROMPT_TEMPLATE_VERSIONS[key];
}
