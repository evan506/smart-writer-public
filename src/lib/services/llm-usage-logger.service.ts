import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";
import type { LLMUsageCallback, LLMUsageMetadata } from "./llm.service";

export type LLMUsageFeature =
  | "entity_extraction"
  | "analysis"
  | "embedding"
  | "report"
  | "chat"
  | "search_rag";

export type LLMUsageLogContext = {
  projectId: string;
  userId?: string | null;
  feature: LLMUsageFeature;
  promptTemplateKey?: string;
  promptTemplateVersion?: string;
};

type LLMUsageLogInsert = Database["public"]["Tables"]["llm_usage_logs"]["Insert"];

function getNestedNumber(value: unknown, path: string[]): number | null {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function getUsageNumber(usage: LLMUsageMetadata["usage"], key: string): number | null {
  if (!usage || typeof usage !== "object") return null;
  const value = (usage as unknown as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeCost(costUsd: number | undefined): number | null {
  return typeof costUsd === "number" && Number.isFinite(costUsd) ? costUsd : null;
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? {})) as Json;
}

export function buildLLMUsageLogInsert(
  context: LLMUsageLogContext,
  metadata: LLMUsageMetadata
): LLMUsageLogInsert {
  return {
    project_id: context.projectId,
    user_id: context.userId ?? null,
    feature: context.feature,
    provider: metadata.provider,
    model: metadata.model,
    provider_response_id: metadata.providerResponseId ?? null,
    prompt_template_key: context.promptTemplateKey ?? null,
    prompt_template_version: context.promptTemplateVersion ?? null,
    status: metadata.success ? "success" : "error",
    prompt_tokens: getUsageNumber(metadata.usage, "prompt_tokens"),
    completion_tokens: getUsageNumber(metadata.usage, "completion_tokens"),
    total_tokens: getUsageNumber(metadata.usage, "total_tokens"),
    cached_prompt_tokens: getNestedNumber(metadata.usage, [
      "prompt_tokens_details",
      "cached_tokens",
    ]),
    reasoning_tokens: getNestedNumber(metadata.usage, [
      "completion_tokens_details",
      "reasoning_tokens",
    ]),
    cost_usd: normalizeCost(metadata.costUsd),
    latency_ms: metadata.elapsedMs,
    retry_count: metadata.retryCount,
    timed_out: metadata.timedOut,
    error_type: metadata.errorType ?? null,
    raw_usage: toJson(metadata.usage),
  };
}

export function createLLMUsageLogger(
  supabase: SupabaseClient<Database>,
  context: LLMUsageLogContext
): LLMUsageCallback {
  return async (metadata) => {
    const payload = buildLLMUsageLogInsert(context, metadata);
    const { error } = await supabase.from("llm_usage_logs").insert(payload);
    if (error) {
      console.error("[LLMUsageLogger] insert failed:", error.message);
    }
  };
}
