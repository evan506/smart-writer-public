import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { callLLM } from "../llm.service";
import { createLLMUsageLogger } from "../llm-usage-logger.service";
import { getLLMModel } from "../llm-models";
import { getPromptTemplateVersion } from "../prompt-versions";
import { extractJsonArraySlice } from "../llm-json";
import {
  type DistillationCandidate,
  prepareDistilledRules,
} from "./distillation";
import { insertDistilledProposals } from "./write.service";

type Db = SupabaseClient<Database>;

// Don't bother distilling until the author has rejected enough candidates for
// a pattern to be meaningful rather than noise.
export const MIN_DISMISSALS_FOR_DISTILLATION = 4;
const DISMISSED_SAMPLE_LIMIT = 40;

export const DISTILLATION_SYSTEM_PROMPT = `당신은 한국 웹소설 설정 추출 도구의 보조자입니다.
작가가 "설정 후보"로 거절한 이름 목록을 보고, 앞으로 추출에서 피해야 할 "일반적인 제외 규칙"을 제안합니다.

규칙:
- 특정 고유명사(인물/장소 이름)를 규칙에 포함하지 마세요. 일반적 패턴만 제안합니다.
- 예: "이름이 없는 불특정 인물은 제외", "회상 속에서 다시 언급된 기존 인물은 중복 생성하지 않음".
- 거절 목록에서 분명한 공통 패턴이 없으면 빈 배열을 반환합니다.
- 최대 5개까지만 제안합니다.

반드시 다음 JSON 형식만 출력하세요(설명 금지):
[{"key": "영문_스네이크_식별자", "text": "한국어 제외 규칙 문장"}]`;

/** Parse the LLM response into distillation candidates, tolerant of fences. */
export function parseDistillationResponse(raw: string): DistillationCandidate[] {
  if (!raw) return [];
  const jsonSlice = extractJsonArraySlice(raw);
  if (!jsonSlice) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const candidates: DistillationCandidate[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const text = typeof obj.text === "string" ? obj.text.trim() : "";
    if (!text) continue;
    candidates.push({
      key: typeof obj.key === "string" ? obj.key : undefined,
      text,
    });
  }
  return candidates;
}

export interface DistillationDeps {
  loadRecentDismissedNames(projectId: string, limit: number): Promise<string[]>;
  loadApprovedEntityNames(projectId: string): Promise<string[]>;
  loadExistingRuleKeys(projectId: string): Promise<Set<string>>;
  proposeRules(input: { dismissedNames: string[] }): Promise<string>;
  insertProposals(
    projectId: string,
    rules: ReturnType<typeof prepareDistilledRules>["accepted"]
  ): Promise<{ inserted: number; error: string | null }>;
}

export interface DistillationOutcome {
  proposed: number;
  skippedReason?: "too_few_dismissals" | "no_patterns";
  error: string | null;
}

/**
 * Distill recent dismissals into DISABLED proposal rules. Never auto-activates:
 * proposals only affect extraction after the author turns them on.
 */
export async function runExtractionDistillation(
  projectId: string,
  deps: DistillationDeps
): Promise<DistillationOutcome> {
  const dismissedNames = await deps.loadRecentDismissedNames(
    projectId,
    DISMISSED_SAMPLE_LIMIT
  );
  if (dismissedNames.length < MIN_DISMISSALS_FOR_DISTILLATION) {
    return { proposed: 0, skippedReason: "too_few_dismissals", error: null };
  }

  const [approvedEntityNames, existingKeys] = await Promise.all([
    deps.loadApprovedEntityNames(projectId),
    deps.loadExistingRuleKeys(projectId),
  ]);

  let raw: string;
  try {
    raw = await deps.proposeRules({ dismissedNames });
  } catch (err) {
    return {
      proposed: 0,
      error: err instanceof Error ? err.message : "distillation LLM failed",
    };
  }

  const candidates = parseDistillationResponse(raw);
  const { accepted } = prepareDistilledRules(candidates, {
    approvedEntityNames,
    existingKeys,
  });
  if (accepted.length === 0) {
    return { proposed: 0, skippedReason: "no_patterns", error: null };
  }

  const { inserted, error } = await deps.insertProposals(projectId, accepted);
  return { proposed: inserted, error };
}

// --- Default DB-backed deps -------------------------------------------------

export function createDistillationDeps(
  supabase: Db,
  usageContext?: { projectId: string; userId?: string | null }
): DistillationDeps {
  return {
    async loadRecentDismissedNames(projectId, limit) {
      const { data } = await supabase
        .from("entity_suggestions")
        .select("name, updated_at")
        .eq("project_id", projectId)
        .eq("status", "DISMISSED")
        .neq("type", "RELATION")
        .order("updated_at", { ascending: false })
        .limit(limit);
      return data?.map((row) => row.name) ?? [];
    },
    async loadApprovedEntityNames(projectId) {
      const { data } = await supabase
        .from("entities")
        .select("name")
        .eq("project_id", projectId);
      return data?.map((row) => row.name) ?? [];
    },
    async loadExistingRuleKeys(projectId) {
      const { data } = await supabase
        .from("extraction_memory")
        .select("rule_key")
        .eq("project_id", projectId)
        .eq("kind", "EXCLUDE_PATTERN");
      return new Set((data ?? []).map((row) => row.rule_key));
    },
    async proposeRules({ dismissedNames }) {
      return callLLM({
        system: DISTILLATION_SYSTEM_PROMPT,
        user: `거절된 설정 후보 이름 목록:\n${dismissedNames.join(", ")}`,
        maxTokens: 512,
        model: getLLMModel("distillation"),
        temperature: 0,
        // Logged under entity_extraction (llm_usage_logs feature enum has no
        // distillation value); the template key disambiguates.
        onComplete: usageContext
          ? createLLMUsageLogger(supabase, {
              projectId: usageContext.projectId,
              userId: usageContext.userId ?? null,
              feature: "entity_extraction",
              promptTemplateKey: "extraction_memory.distillation",
              promptTemplateVersion: getPromptTemplateVersion("extraction_memory.distillation"),
            })
          : undefined,
      });
    },
    insertProposals(projectId, rules) {
      return insertDistilledProposals(supabase, projectId, rules);
    },
  };
}
