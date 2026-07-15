"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProjectOwner } from "@/lib/auth/ownership";
import { EntityExtractionService } from "@/lib/services/entity-extraction.service";
import {
  getMergeTargetValidationError,
  splitSuggestionsForBatchConfirmation,
} from "@/lib/services/suggestion-action-utils";
import {
  countPendingSuggestions,
  getChapterExtractionSummary,
  listPendingSuggestions,
  listSuggestionAliasTargets,
} from "@/lib/services/suggestions/read.service";
import { confirmEntitySuggestion } from "@/lib/services/suggestions/confirm-entity.service";
import {
  confirmSuggestionAlias,
  rejectSuggestionAliasTarget as rejectSuggestionAliasTargetSelection,
} from "@/lib/services/suggestions/alias.service";
import {
  confirmRelationSuggestion,
  confirmRelationSuggestionBatch,
} from "@/lib/services/suggestions/relation.service";
import {
  dismissPendingSuggestionsForProject,
  dismissSuggestionAndAppendExcludedTerm,
  dismissSuggestionById,
} from "@/lib/services/suggestions/dismiss.service";
import { confirmEntitySuggestionBatch } from "@/lib/services/suggestions/batch.service";
import {
  approveFactSuggestion,
  dismissFactSuggestion,
  listPendingFactSuggestions,
  supersedeFactSuggestion,
} from "@/lib/services/canon-facts/suggestions.service";
import type { EntityType } from "@/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AliasTargetRow = {
  id: string;
  project_id: string;
  name: string;
  summary: string | null;
  aliases: unknown;
};

export async function getSuggestions(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error, suggestions: [] };

  return listPendingSuggestions(supabase, projectId);
}

export async function getSuggestionCount(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return 0;

  return countPendingSuggestions(supabase, projectId);
}

export async function getFactSuggestions(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error, suggestions: [] };

  return listPendingFactSuggestions(supabase, projectId);
}

export async function getSuggestionAliasTargets(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error, entities: [] };

  return listSuggestionAliasTargets(supabase, projectId);
}

export async function getExtractionSummary(
  projectId: string,
  chapterId: string,
  since?: string
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) {
    return {
      error: owner.error,
      pendingCount: 0,
      autoConfirmedEntityCount: 0,
      autoConfirmedRelationCount: 0,
      confirmedNames: [] as string[],
    };
  }

  return getChapterExtractionSummary(supabase, projectId, chapterId, since);
}

// ── Inner helpers (single client, no revalidatePath) ──

async function getAliasTargetForProject(
  supabase: SupabaseClient,
  projectId: string,
  targetEntityId: string
): Promise<{ error: string | null; target?: AliasTargetRow }> {
  const { data: target, error: targetError } = await supabase
    .from("entities")
    .select("id, project_id, name, summary, aliases")
    .eq("id", targetEntityId)
    .single();

  if (targetError || !target) {
    return { error: targetError?.message ?? "작품 기억 항목을 찾을 수 없습니다" };
  }
  if (target.project_id !== projectId) {
    return { error: "권한이 없거나 존재하지 않는 항목입니다" };
  }

  return { error: null, target };
}

// ── Public server actions ──

export async function confirmSuggestion(
  suggestionId: string,
  projectId: string,
  overrides?: { name?: string; type?: EntityType; summary?: string; aliases?: string[] }
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: suggestion, error: fetchError } = await supabase
    .from("entity_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .single();

  if (fetchError || !suggestion) {
    return { error: fetchError?.message ?? "제안을 찾을 수 없습니다" };
  }
  if (suggestion.project_id !== projectId) {
    return { error: "제안을 찾을 수 없습니다" };
  }
  if (suggestion.status !== "PENDING") {
    return { error: "이미 처리된 확인 후보입니다" };
  }

  let result;
  if (suggestion.type === "RELATION") {
    result = await confirmRelationSuggestion(supabase, suggestion, projectId);
  } else if (suggestion.suggested_action === "MERGE") {
    const targetError = getMergeTargetValidationError(suggestion);
    if (targetError) return { error: targetError };
    const targetEntityId = suggestion.matched_entity_id;
    if (!targetEntityId) return { error: "별칭/호칭으로 저장할 기존 항목을 먼저 선택하세요." };
    const targetResult = await getAliasTargetForProject(supabase, projectId, targetEntityId);
    if (targetResult.error || !targetResult.target) return { error: targetResult.error };
    result = await confirmSuggestionAlias(supabase, suggestion, targetResult.target, projectId);
  } else {
    result = await confirmEntitySuggestion(supabase, suggestion, projectId, overrides);
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  return result;
}

export async function confirmSuggestionAsAlias(
  suggestionId: string,
  projectId: string,
  targetEntityId: string
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: suggestion, error: suggestionError } = await supabase
    .from("entity_suggestions")
    .select("id, project_id, name, type, aliases, status")
    .eq("id", suggestionId)
    .single();

  if (suggestionError || !suggestion) {
    return { error: suggestionError?.message ?? "확인 후보를 찾을 수 없습니다" };
  }
  if (suggestion.project_id !== projectId) {
    return { error: "권한이 없거나 존재하지 않는 항목입니다" };
  }
  if (suggestion.status !== "PENDING") {
    return { error: "이미 처리된 확인 후보입니다" };
  }
  if (suggestion.type === "RELATION") {
    return { error: "관계 후보는 별칭/호칭으로 저장할 수 없습니다" };
  }

  const targetResult = await getAliasTargetForProject(supabase, projectId, targetEntityId);
  if (targetResult.error || !targetResult.target) {
    return { error: targetResult.error };
  }

  const result = await confirmSuggestionAlias(supabase, suggestion, targetResult.target, projectId);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null, targetName: result.targetName };
}

export async function rejectSuggestionAliasTarget(
  suggestionId: string,
  projectId: string
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: suggestion, error: fetchError } = await supabase
    .from("entity_suggestions")
    .select("id, project_id, type, status, suggested_action, matched_entity_id")
    .eq("id", suggestionId)
    .single();

  if (fetchError || !suggestion) {
    return { error: fetchError?.message ?? "확인 후보를 찾을 수 없습니다" };
  }
  if (suggestion.project_id !== projectId) {
    return { error: "권한이 없거나 존재하지 않는 항목입니다" };
  }
  if (suggestion.status !== "PENDING") {
    return { error: "이미 처리된 확인 후보입니다" };
  }
  if (suggestion.type === "RELATION") {
    return { error: "관계 후보에는 저장 대상을 해제할 수 없습니다" };
  }
  if (suggestion.suggested_action !== "MERGE") {
    return { error: "별칭/호칭 후보에만 사용할 수 있습니다" };
  }
  if (!suggestion.matched_entity_id) {
    return { error: null };
  }

  const result = await rejectSuggestionAliasTargetSelection(supabase, suggestionId);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

export async function confirmAllSuggestions(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: suggestions, error } = await supabase
    .from("entity_suggestions")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "PENDING");

  if (error || !suggestions) return { error: error?.message ?? "조회 실패" };

  // Entity candidates first, relation candidates later because relations need saved endpoints.
  const { entitySuggestions, relationSuggestions } =
    splitSuggestionsForBatchConfirmation(suggestions);

  const entityResult = await confirmEntitySuggestionBatch(supabase, entitySuggestions, projectId);
  if (entityResult.error) return { error: entityResult.error };

  const relationResult = await confirmRelationSuggestionBatch(supabase, relationSuggestions, projectId);
  if (relationResult.error) return { error: relationResult.error };

  const confirmed = entityResult.confirmed + relationResult.confirmed;

  // importance 비동기 재계산
  after(async () => {
    const bgSupabase = await createClient();
    const svc = new EntityExtractionService(bgSupabase);
    await svc.recalculateImportance(projectId);
  });

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null, confirmed, skippedMerge: entityResult.skippedMerge };
}

export async function confirmRecommendedSuggestions(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: suggestions, error } = await supabase
    .from("entity_suggestions")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "PENDING")
    .gte("confidence", 0.8);

  if (error || !suggestions) return { error: error?.message ?? "조회 실패" };

  const { entitySuggestions, relationSuggestions } =
    splitSuggestionsForBatchConfirmation(suggestions);

  const entityResult = await confirmEntitySuggestionBatch(supabase, entitySuggestions, projectId);
  if (entityResult.error) return { error: entityResult.error };

  const relationResult = await confirmRelationSuggestionBatch(supabase, relationSuggestions, projectId);
  if (relationResult.error) return { error: relationResult.error };

  const confirmed = entityResult.confirmed + relationResult.confirmed;

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null, confirmed, skippedMerge: entityResult.skippedMerge };
}

export async function dismissSuggestion(
  suggestionId: string,
  projectId: string
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: suggestion } = await supabase
    .from("entity_suggestions")
    .select("id, name, type, project_id, status")
    .eq("id", suggestionId)
    .single();

  if (!suggestion || suggestion.project_id !== projectId) {
    return { error: "제안을 찾을 수 없습니다" };
  }
  if (suggestion.status !== "PENDING") {
    return { error: "이미 처리된 확인 후보입니다" };
  }

  const result = await dismissSuggestionById(supabase, suggestion.id);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

export async function dismissSuggestionAndExclude(
  suggestionId: string,
  projectId: string
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: suggestion } = await supabase
    .from("entity_suggestions")
    .select("id, name, type, project_id, status")
    .eq("id", suggestionId)
    .single();

  if (!suggestion || suggestion.project_id !== projectId) {
    return { error: "제안을 찾을 수 없습니다" };
  }
  if (suggestion.status !== "PENDING") {
    return { error: "이미 처리된 확인 후보입니다" };
  }
  if (suggestion.type === "RELATION") {
    return { error: "관계 후보는 제외 목록에 추가할 수 없습니다" };
  }

  const result = await dismissSuggestionAndAppendExcludedTerm(
    supabase,
    suggestion,
    projectId
  );
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

export async function dismissAllSuggestions(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await dismissPendingSuggestionsForProject(supabase, projectId);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

export async function confirmFactSuggestion(
  suggestionId: string,
  projectId: string
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await approveFactSuggestion(supabase, suggestionId, projectId);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return result;
}

export async function supersedePendingFactSuggestion(
  suggestionId: string,
  projectId: string,
  conflictingFactId: string
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await supersedeFactSuggestion(
    supabase,
    suggestionId,
    projectId,
    conflictingFactId
  );
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return result;
}

export async function dismissPendingFactSuggestion(
  suggestionId: string,
  projectId: string
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await dismissFactSuggestion(supabase, suggestionId, projectId);
  if (result.error) return { error: result.error };

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null };
}

export async function confirmFactSuggestionBatch(
  projectId: string,
  suggestionIds: string[]
): Promise<{
  error: string | null;
  confirmedCount: number;
  skipped: Array<{ id: string; reason: string }>;
}> {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error, confirmedCount: 0, skipped: [] };

  let confirmedCount = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const suggestionId of suggestionIds) {
    const result = await approveFactSuggestion(supabase, suggestionId, projectId);
    if (result.error) {
      skipped.push({ id: suggestionId, reason: result.error });
    } else {
      confirmedCount += 1;
    }
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  return { error: null, confirmedCount, skipped };
}
