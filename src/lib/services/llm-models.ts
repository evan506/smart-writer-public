// Central model registry. Every callLLM site resolves its model here so a
// model can be swapped per deployment (or per eval run) via env without a
// code change, e.g.:
//   SMART_WRITER_MODEL_EXTRACTION=anthropic/claude-haiku-4.5 pnpm ops:extraction-eval:golden

export type LLMModelSlot =
  | "extraction"
  | "analysis"
  | "canonQnA"
  | "distillation";

const DEFAULTS: Record<LLMModelSlot, string> = {
  // 2026-07-08: anthropic/claude-3.5-haiku was removed from OpenRouter
  // (404 No endpoints) — haiku-4.5 is the closest live tier.
  extraction: "anthropic/claude-haiku-4.5",
  analysis: "anthropic/claude-haiku-4.5",
  canonQnA: "anthropic/claude-sonnet-4.5",
  distillation: "anthropic/claude-sonnet-4.5",
};

const ENV_KEYS: Record<LLMModelSlot, string> = {
  extraction: "SMART_WRITER_MODEL_EXTRACTION",
  analysis: "SMART_WRITER_MODEL_ANALYSIS",
  canonQnA: "SMART_WRITER_MODEL_QNA",
  distillation: "SMART_WRITER_MODEL_DISTILLATION",
};

/** Resolved at call time (not module init) so env overrides apply in tests
 *  and per-process eval runs. */
export function getLLMModel(slot: LLMModelSlot): string {
  const override = process.env[ENV_KEYS[slot]]?.trim();
  return override || DEFAULTS[slot];
}

export type LLMProviderRouting = {
  order?: string[];
  ignore?: string[];
  zdr?: boolean;
};

function parseList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

/**
 * OpenRouter provider-routing defaults from env, applied to every callLLM
 * unless the call site passes an explicit routing. This is the precondition
 * for adopting open-weight models safely (e.g. run DeepSeek only on
 * US-hosted ZDR resellers):
 *   SMART_WRITER_LLM_PROVIDER_ORDER=fireworks,deepinfra
 *   SMART_WRITER_LLM_PROVIDER_IGNORE=deepseek
 *   SMART_WRITER_LLM_PROVIDER_ZDR=1
 * All unset → undefined → no provider field sent (OpenRouter default routing).
 */
export function getLLMProviderRouting(): LLMProviderRouting | undefined {
  const order = parseList(process.env.SMART_WRITER_LLM_PROVIDER_ORDER);
  const ignore = parseList(process.env.SMART_WRITER_LLM_PROVIDER_IGNORE);
  const zdr = process.env.SMART_WRITER_LLM_PROVIDER_ZDR === "1" || undefined;
  if (!order && !ignore && !zdr) return undefined;
  return { order, ignore, zdr };
}
