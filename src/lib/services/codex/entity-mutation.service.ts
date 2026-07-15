import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLLMUsageLogger } from "../llm-usage-logger.service";
import { embedText } from "../embedding.service";
import type { EntityType } from "@/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type CodexEntityMutationInput = {
  projectId: string;
  name: string;
  type: EntityType;
  summary: string | null;
  aliases: string[] | null;
};

type MergeEntityRow = {
  id: string;
  project_id: string;
  name: string;
  type: string;
  summary: string | null;
  aliases: unknown;
};

type MergeFactRow = {
  id: string;
  fact_type: string;
  fact_key: string | null;
  value: string;
  status: string;
};

function scheduleEntityEmbedding(
  entityId: string,
  projectId: string | undefined,
  input: Pick<CodexEntityMutationInput, "name" | "summary" | "aliases">
) {
  after(async () => {
    const embeddingText = [input.name, input.summary, ...(input.aliases ?? [])]
      .filter(Boolean)
      .join(" ");
    const bgSupabase = await createClient();
    const embedding = await embedText(embeddingText, {
      onComplete: projectId
        ? createLLMUsageLogger(bgSupabase, {
            projectId,
            feature: "embedding",
            promptTemplateKey: "codex.entity_embedding",
            promptTemplateVersion: "v1",
          })
        : undefined,
    });
    const { error } = await bgSupabase
      .from("entities")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", entityId);
    if (error) {
      console.error("[Codex] embedding update error:", error.message);
    }
  });
}

function normalizeAliases(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((alias): alias is string => typeof alias === "string")
    .map((alias) => alias.trim())
    .filter(Boolean);
}

function mergeAliasValues(target: MergeEntityRow, source: MergeEntityRow) {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const alias of [
    ...normalizeAliases(target.aliases),
    source.name,
    ...normalizeAliases(source.aliases),
  ]) {
    if (alias === target.name) continue;
    const key = alias.toLocaleLowerCase("ko");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(alias);
  }

  return merged;
}

function factIdentity(fact: Pick<MergeFactRow, "fact_type" | "fact_key" | "value">) {
  return `${fact.fact_type}\u0000${fact.fact_key ?? ""}\u0000${fact.value}`;
}

export async function createCodexEntity(
  supabase: SupabaseClient,
  input: CodexEntityMutationInput
): Promise<{ error: string | null }> {
  const { data, error } = await supabase
    .from("entities")
    .insert({
      project_id: input.projectId,
      name: input.name,
      type: input.type,
      summary: input.summary,
      aliases: input.aliases,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  scheduleEntityEmbedding(data.id, input.projectId, input);
  return { error: null };
}

export async function updateCodexEntity(
  supabase: SupabaseClient,
  entityId: string,
  input: Omit<CodexEntityMutationInput, "projectId">,
  projectId?: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("entities")
    .update({
      name: input.name,
      type: input.type,
      summary: input.summary,
      aliases: input.aliases,
    })
    .eq("id", entityId);

  if (error) return { error: error.message };

  scheduleEntityEmbedding(entityId, projectId, input);
  return { error: null };
}

export async function deleteCodexEntity(
  supabase: SupabaseClient,
  {
    entityId,
    projectId,
    entityName,
    blockTerm,
  }: {
    entityId: string;
    projectId: string;
    entityName: string;
    blockTerm?: boolean;
  }
): Promise<{ error: string | null }> {
  const { error: linksError } = await supabase
    .from("entity_links")
    .delete()
    .or(`from_id.eq.${entityId},to_id.eq.${entityId}`);
  if (linksError) return { error: `관계 삭제 실패: ${linksError.message}` };

  const { error: mentionsError } = await supabase
    .from("mentions")
    .delete()
    .eq("entity_id", entityId);
  if (mentionsError) return { error: `멘션 삭제 실패: ${mentionsError.message}` };

  const { error } = await supabase.from("entities").delete().eq("id", entityId);
  if (error) return { error: error.message };

  if (blockTerm) {
    const { data: project } = await supabase
      .from("projects")
      .select("excluded_terms")
      .eq("id", projectId)
      .single();

    const currentExcluded = Array.isArray(project?.excluded_terms)
      ? (project.excluded_terms as string[])
      : [];

    if (!currentExcluded.includes(entityName)) {
      const { error: excludedTermsError } = await supabase
        .from("projects")
        .update({ excluded_terms: [...currentExcluded, entityName] })
        .eq("id", projectId);
      if (excludedTermsError) {
        console.error("[Codex] excluded_terms update error:", excludedTermsError.message);
      }
    }
  }

  return { error: null };
}

export async function mergeCodexEntityAsAlias(
  supabase: SupabaseClient,
  {
    sourceEntityId,
    targetEntityId,
    projectId,
  }: {
    sourceEntityId: string;
    targetEntityId: string;
    projectId: string;
  }
): Promise<{ error: string | null; sourceName?: string; targetName?: string }> {
  if (sourceEntityId === targetEntityId) {
    return { error: "같은 항목으로는 합칠 수 없습니다" };
  }

  const { data: source, error: sourceError } = await supabase
    .from("entities")
    .select("id, project_id, name, type, summary, aliases")
    .eq("id", sourceEntityId)
    .single();
  if (sourceError || !source) {
    return { error: sourceError?.message ?? "합칠 항목을 찾을 수 없습니다" };
  }

  const { data: target, error: targetError } = await supabase
    .from("entities")
    .select("id, project_id, name, type, summary, aliases")
    .eq("id", targetEntityId)
    .single();
  if (targetError || !target) {
    return { error: targetError?.message ?? "대상 항목을 찾을 수 없습니다" };
  }

  const sourceRow = source as MergeEntityRow;
  const targetRow = target as MergeEntityRow;

  if (sourceRow.project_id !== projectId || targetRow.project_id !== projectId) {
    return { error: "같은 프로젝트의 작품 기억 항목만 합칠 수 있습니다" };
  }

  const mergedAliases = mergeAliasValues(targetRow, sourceRow);
  const { error: aliasError } = await supabase
    .from("entities")
    .update({ aliases: mergedAliases })
    .eq("id", targetEntityId);
  if (aliasError) return { error: `별칭 저장 실패: ${aliasError.message}` };

  const { error: suggestionError } = await supabase
    .from("entity_suggestions")
    .update({ matched_entity_id: targetEntityId })
    .eq("project_id", projectId)
    .eq("matched_entity_id", sourceEntityId);
  if (suggestionError) return { error: `원문 근거 이전 실패: ${suggestionError.message}` };

  const { error: factSuggestionError } = await supabase
    .from("fact_suggestions")
    .update({ matched_entity_id: targetEntityId })
    .eq("project_id", projectId)
    .eq("matched_entity_id", sourceEntityId);
  if (factSuggestionError) {
    return { error: `세부 설정 후보 이전 실패: ${factSuggestionError.message}` };
  }

  const { error: mentionError } = await supabase
    .from("mentions")
    .update({ entity_id: targetEntityId })
    .eq("entity_id", sourceEntityId);
  if (mentionError) return { error: `등장 기록 이전 실패: ${mentionError.message}` };

  const { error: fromLinkError } = await supabase
    .from("entity_links")
    .update({ from_id: targetEntityId })
    .eq("from_id", sourceEntityId);
  if (fromLinkError) return { error: `관계 이전 실패: ${fromLinkError.message}` };

  const { error: toLinkError } = await supabase
    .from("entity_links")
    .update({ to_id: targetEntityId })
    .eq("to_id", sourceEntityId);
  if (toLinkError) return { error: `관계 이전 실패: ${toLinkError.message}` };

  const { error: selfLinkError } = await supabase
    .from("entity_links")
    .delete()
    .eq("from_id", targetEntityId)
    .eq("to_id", targetEntityId);
  if (selfLinkError) return { error: `중복 관계 정리 실패: ${selfLinkError.message}` };

  const [{ data: sourceFacts, error: sourceFactError }, { data: targetFacts, error: targetFactError }] =
    await Promise.all([
      supabase
        .from("canon_facts")
        .select("id, fact_type, fact_key, value, status")
        .eq("project_id", projectId)
        .eq("entity_id", sourceEntityId),
      supabase
        .from("canon_facts")
        .select("id, fact_type, fact_key, value, status")
        .eq("project_id", projectId)
        .eq("entity_id", targetEntityId),
    ]);
  if (sourceFactError) return { error: `승인된 설정 이전 실패: ${sourceFactError.message}` };
  if (targetFactError) return { error: `대상 설정 확인 실패: ${targetFactError.message}` };

  const activeTargetFacts = new Map<string, MergeFactRow>();
  for (const fact of (targetFacts ?? []) as MergeFactRow[]) {
    if (fact.status === "PENDING" || fact.status === "APPROVED") {
      activeTargetFacts.set(factIdentity(fact), fact);
    }
  }

  for (const fact of (sourceFacts ?? []) as MergeFactRow[]) {
    const duplicate = (fact.status === "PENDING" || fact.status === "APPROVED")
      ? activeTargetFacts.get(factIdentity(fact))
      : null;

    if (duplicate) {
      const { error: sourceMoveError } = await supabase
        .from("canon_fact_sources")
        .update({ fact_id: duplicate.id })
        .eq("fact_id", fact.id);
      if (sourceMoveError) {
        return { error: `설정 근거 이전 실패: ${sourceMoveError.message}` };
      }

      const { error: duplicateDeleteError } = await supabase
        .from("canon_facts")
        .delete()
        .eq("id", fact.id);
      if (duplicateDeleteError) {
        return { error: `중복 설정 정리 실패: ${duplicateDeleteError.message}` };
      }
      continue;
    }

    const { error: factMoveError } = await supabase
      .from("canon_facts")
      .update({ entity_id: targetEntityId })
      .eq("id", fact.id);
    if (factMoveError) return { error: `승인된 설정 이전 실패: ${factMoveError.message}` };
  }

  const { data: foreshadows, error: foreshadowReadError } = await supabase
    .from("foreshadows")
    .select("id, entity_ids")
    .eq("project_id", projectId);
  if (foreshadowReadError) {
    return { error: `복선 연결 확인 실패: ${foreshadowReadError.message}` };
  }

  for (const row of foreshadows ?? []) {
    const ids = Array.isArray(row.entity_ids)
      ? row.entity_ids.filter((id): id is string => typeof id === "string")
      : [];
    if (!ids.includes(sourceEntityId)) continue;
    const nextIds = Array.from(
      new Set(ids.map((id) => (id === sourceEntityId ? targetEntityId : id)))
    );
    const { error: foreshadowUpdateError } = await supabase
      .from("foreshadows")
      .update({ entity_ids: nextIds })
      .eq("id", row.id);
    if (foreshadowUpdateError) {
      return { error: `복선 연결 이전 실패: ${foreshadowUpdateError.message}` };
    }
  }

  const { error: deleteError } = await supabase
    .from("entities")
    .delete()
    .eq("id", sourceEntityId);
  if (deleteError) return { error: `중복 항목 삭제 실패: ${deleteError.message}` };

  scheduleEntityEmbedding(targetEntityId, projectId, {
    name: targetRow.name,
    summary: targetRow.summary,
    aliases: mergedAliases,
  });

  return {
    error: null,
    sourceName: sourceRow.name,
    targetName: targetRow.name,
  };
}
