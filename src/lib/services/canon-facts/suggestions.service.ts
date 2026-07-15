import type { createClient } from "@/lib/supabase/server";
import type { CanonFactInsert, FactSuggestion, FactSuggestionUpdate } from "@/types";
import type { Database } from "@/types/database.types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type PendingFactReviewItemRow =
  Database["public"]["Functions"]["list_pending_fact_review_items"]["Returns"][number];

export interface PendingFactSuggestion {
  id: string;
  projectId: string;
  chapterId: string;
  chapterNum: number | null;
  chapterTitle: string | null;
  entityId: string | null;
  entityName: string | null;
  entitySuggestionId: string | null;
  entitySuggestionName: string | null;
  factType: string;
  factKey: string | null;
  value: string;
  evidenceText: string | null;
  confidence: number;
  canApprove: boolean;
  existingFactId: string | null;
  existingSourceCount: number;
  conflictingFactId: string | null;
  conflictingValue: string | null;
  approvalMode: "CREATE_FACT" | "ADD_SOURCE" | "WAIT_FOR_ENTITY";
}

export async function listPendingFactSuggestions(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ error: string | null; suggestions: PendingFactSuggestion[] }> {
  const { data, error } = await supabase
    .rpc("list_pending_fact_review_items", { p_project_id: projectId });

  if (error) return { error: error.message, suggestions: [] };

  return {
    error: null,
    suggestions: ((data ?? []) as PendingFactReviewItemRow[]).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      chapterId: row.chapter_id,
      chapterNum: row.chapter_num,
      chapterTitle: row.chapter_title,
      entityId: row.entity_id,
      entityName: row.entity_name,
      entitySuggestionId: row.entity_suggestion_id,
      entitySuggestionName: row.entity_suggestion_name,
      factType: row.fact_type,
      factKey: row.fact_key,
      value: row.value,
      evidenceText: row.evidence_text,
      confidence: row.confidence,
      canApprove: row.can_approve,
      existingFactId: row.existing_fact_id,
      existingSourceCount: row.existing_source_count,
      conflictingFactId: row.conflicting_fact_id,
      conflictingValue: row.conflicting_value,
      approvalMode: normalizeApprovalMode(row),
    })),
  };
}

export async function approveFactSuggestion(
  supabase: SupabaseClient,
  suggestionId: string,
  projectId: string
): Promise<{ error: string | null; factId?: string; mode?: "created" | "source_added" }> {
  const { data: suggestion, error } = await supabase
    .from("fact_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .single();

  if (error || !suggestion) {
    return { error: error?.message ?? "설정 후보를 찾을 수 없습니다" };
  }
  if (suggestion.project_id !== projectId) return { error: "설정 후보를 찾을 수 없습니다" };
  if (suggestion.status !== "PENDING") return { error: "이미 처리된 설정 후보입니다" };

  const entityId = await resolveFactSuggestionEntityId(supabase, suggestion);
  if (!entityId) {
    return { error: "먼저 연결된 작품 기억 항목을 저장한 뒤 설정을 승인하세요." };
  }

  const existingFactId = await findExistingActiveFactId(supabase, suggestion, entityId);
  const factId = existingFactId ?? await insertApprovedFact(supabase, suggestion, entityId);
  if (!factId) return { error: "설정 저장에 실패했습니다" };

  const { error: sourceError } = await supabase
    .from("canon_fact_sources")
    .insert({
      fact_id: factId,
      chapter_id: suggestion.chapter_id,
      evidence_text: suggestion.evidence_text,
      evidence_kind: "DIRECT",
    });

  if (sourceError) return { error: sourceError.message };

  const update: FactSuggestionUpdate = {
    status: "APPROVED",
    resulting_fact_id: factId,
    updated_at: new Date().toISOString(),
  };
  const { error: updateError } = await supabase
    .from("fact_suggestions")
    .update(update)
    .eq("id", suggestion.id);

  if (updateError) return { error: updateError.message };

  return { error: null, factId, mode: existingFactId ? "source_added" : "created" };
}

export async function supersedeFactSuggestion(
  supabase: SupabaseClient,
  suggestionId: string,
  projectId: string,
  conflictingFactId: string
): Promise<{ error: string | null; factId?: string; supersededFactId?: string; mode?: "superseded" }> {
  const { data: suggestion, error } = await supabase
    .from("fact_suggestions")
    .select("*")
    .eq("id", suggestionId)
    .single();

  if (error || !suggestion) {
    return { error: error?.message ?? "설정 후보를 찾을 수 없습니다" };
  }
  if (suggestion.project_id !== projectId) return { error: "설정 후보를 찾을 수 없습니다" };
  if (suggestion.status !== "PENDING") return { error: "이미 처리된 설정 후보입니다" };

  const entityId = await resolveFactSuggestionEntityId(supabase, suggestion);
  if (!entityId) {
    return { error: "먼저 연결된 작품 기억 항목을 저장한 뒤 설정을 승인하세요." };
  }

  const conflict = await getSupersedableConflict(
    supabase,
    suggestion,
    entityId,
    conflictingFactId
  );
  if (conflict.error) return { error: conflict.error };

  const newFactId = await insertApprovedFact(supabase, suggestion, entityId);
  if (!newFactId) return { error: "대체할 새 설정 저장에 실패했습니다" };

  const { error: sourceError } = await supabase
    .from("canon_fact_sources")
    .insert({
      fact_id: newFactId,
      chapter_id: suggestion.chapter_id,
      evidence_text: suggestion.evidence_text,
      evidence_kind: "DIRECT",
    });

  if (sourceError) return { error: sourceError.message };

  const { error: supersedeError } = await supabase
    .from("canon_facts")
    .update({
      status: "SUPERSEDED",
      superseded_by: newFactId,
      valid_until_chapter_id: suggestion.chapter_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conflictingFactId)
    .eq("project_id", projectId)
    .eq("status", "APPROVED");

  if (supersedeError) return { error: supersedeError.message };

  const update: FactSuggestionUpdate = {
    status: "APPROVED",
    resulting_fact_id: newFactId,
    updated_at: new Date().toISOString(),
  };
  const { error: updateError } = await supabase
    .from("fact_suggestions")
    .update(update)
    .eq("id", suggestion.id);

  if (updateError) return { error: updateError.message };

  return {
    error: null,
    factId: newFactId,
    supersededFactId: conflictingFactId,
    mode: "superseded",
  };
}

export async function dismissFactSuggestion(
  supabase: SupabaseClient,
  suggestionId: string,
  projectId: string
): Promise<{ error: string | null }> {
  const { data: suggestion, error } = await supabase
    .from("fact_suggestions")
    .select("id, project_id, status")
    .eq("id", suggestionId)
    .single();

  if (error || !suggestion || suggestion.project_id !== projectId) {
    return { error: error?.message ?? "설정 후보를 찾을 수 없습니다" };
  }
  if (suggestion.status !== "PENDING") return { error: "이미 처리된 설정 후보입니다" };

  const { error: updateError } = await supabase
    .from("fact_suggestions")
    .update({ status: "DISMISSED", updated_at: new Date().toISOString() })
    .eq("id", suggestion.id);

  if (updateError) return { error: updateError.message };
  return { error: null };
}

async function resolveFactSuggestionEntityId(
  supabase: SupabaseClient,
  suggestion: FactSuggestion
): Promise<string | null> {
  if (suggestion.matched_entity_id) return suggestion.matched_entity_id;
  if (!suggestion.entity_suggestion_id) return null;

  const { data } = await supabase
    .from("entity_suggestions")
    .select("matched_entity_id")
    .eq("id", suggestion.entity_suggestion_id)
    .eq("project_id", suggestion.project_id)
    .maybeSingle();

  return data?.matched_entity_id ?? null;
}

async function findExistingActiveFactId(
  supabase: SupabaseClient,
  suggestion: FactSuggestion,
  entityId: string
): Promise<string | null> {
  const factKey = normalizeFactKey(suggestion.fact_key);
  const query = supabase
    .from("canon_facts")
    .select("id")
    .eq("project_id", suggestion.project_id)
    .eq("entity_id", entityId)
    .eq("fact_type", suggestion.fact_type)
    .eq("value", suggestion.value)
    .in("status", ["PENDING", "APPROVED"])
    .limit(1);

  const { data, error } = factKey
    ? await query.eq("fact_key", factKey)
    : await query.is("fact_key", null);

  if (error) return null;
  return data?.[0]?.id ?? null;
}

async function getSupersedableConflict(
  supabase: SupabaseClient,
  suggestion: FactSuggestion,
  entityId: string,
  conflictingFactId: string
): Promise<{ error: string | null }> {
  const { data: fact, error } = await supabase
    .from("canon_facts")
    .select("id, project_id, entity_id, fact_type, fact_key, value, status")
    .eq("id", conflictingFactId)
    .single();

  if (error || !fact) {
    return { error: error?.message ?? "대체할 기존 설정을 찾을 수 없습니다" };
  }
  if (fact.project_id !== suggestion.project_id) {
    return { error: "대체할 기존 설정을 찾을 수 없습니다" };
  }
  if (fact.status !== "APPROVED") {
    return { error: "승인된 기존 설정만 대체할 수 있습니다" };
  }
  if (
    fact.entity_id !== entityId ||
    fact.fact_type !== suggestion.fact_type ||
    normalizeFactKey(fact.fact_key) !== normalizeFactKey(suggestion.fact_key)
  ) {
    return { error: "같은 항목과 설정 키의 기존 설정만 대체할 수 있습니다" };
  }
  if (fact.value === suggestion.value) {
    return { error: "값이 같은 설정은 대체하지 않고 근거를 추가하세요" };
  }

  return { error: null };
}

async function insertApprovedFact(
  supabase: SupabaseClient,
  suggestion: FactSuggestion,
  entityId: string
): Promise<string | null> {
  const insert: CanonFactInsert = {
    project_id: suggestion.project_id,
    entity_id: entityId,
    fact_type: suggestion.fact_type,
    fact_key: normalizeFactKey(suggestion.fact_key),
    value: suggestion.value,
    confidence: suggestion.confidence,
    status: "APPROVED",
    established_chapter_id: suggestion.chapter_id,
    valid_from_chapter_id: suggestion.chapter_id,
    approved_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("canon_facts")
    .insert(insert)
    .select("id")
    .single();

  if (!error) return data.id;
  if (error.code !== "23505") return null;

  return findExistingActiveFactId(supabase, suggestion, entityId);
}

function normalizeFactKey(factKey: string | null): string | null {
  const normalized = factKey?.trim();
  return normalized ? normalized : null;
}

function normalizeApprovalMode(
  row: PendingFactReviewItemRow
): PendingFactSuggestion["approvalMode"] {
  if (
    row.approval_mode === "CREATE_FACT" ||
    row.approval_mode === "ADD_SOURCE" ||
    row.approval_mode === "WAIT_FOR_ENTITY"
  ) {
    return row.approval_mode;
  }
  if (!row.can_approve) return "WAIT_FOR_ENTITY";
  return row.existing_fact_id ? "ADD_SOURCE" : "CREATE_FACT";
}
