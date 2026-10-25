import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LLMBudgetError } from "../llm-budget.service";
import { createBudgetedEmbeddingOptions } from "../budgeted-embedding";
import { embedText } from "../embedding.service";
import type { EntityType } from "@/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type CodexEntityMutationInput = {
  projectId: string;
  userId?: string | null;
  name: string;
  type: EntityType;
  summary: string | null;
  aliases: string[] | null;
};

export function scheduleEntityEmbedding(
  entityId: string,
  projectId: string | undefined,
  userId: string | null | undefined,
  input: Pick<CodexEntityMutationInput, "name" | "summary" | "aliases">
) {
  after(async () => {
    try {
      const embeddingText = [input.name, input.summary, ...(input.aliases ?? [])]
        .filter(Boolean)
        .join(" ");
      const bgSupabase = await createClient();
      const embedding = await embedText(embeddingText, createBudgetedEmbeddingOptions(bgSupabase, {
        projectId: projectId ?? "",
        userId,
        feature: "embedding",
        promptTemplateKey: "codex.entity_embedding",
        promptTemplateVersion: "v1",
      }));
      const { error } = await bgSupabase
        .from("entities")
        .update({ embedding: JSON.stringify(embedding) })
        .eq("id", entityId);
      if (error) {
        console.error("[Codex] embedding update error:", error.message);
      }
    } catch (error) {
      if (error instanceof LLMBudgetError) {
        console.warn("[AI] optional entity embedding skipped:", error.message);
      } else {
        console.error("[AI] optional entity embedding stopped:", error);
      }
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

  scheduleEntityEmbedding(data.id, input.projectId, input.userId, input);
  return { error: null };
}

export async function updateCodexEntity(
  supabase: SupabaseClient,
  entityId: string,
  input: Omit<CodexEntityMutationInput, "projectId">,
  projectId?: string,
  userId?: string | null
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

  scheduleEntityEmbedding(entityId, projectId, userId, input);
  return { error: null };
}

export async function deleteCodexEntity(
  supabase: SupabaseClient,
  {
    entityId,
    projectId,
    blockTerm,
  }: {
    entityId: string;
    projectId: string;
    entityName: string;
    blockTerm?: boolean;
  }
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc("delete_codex_entity", {
    p_project_id: projectId,
    p_entity_id: entityId,
    p_block_term: blockTerm ?? false,
  });

  return { error: error?.message ?? null };
}

export async function mergeCodexEntityAsAlias(
  supabase: SupabaseClient,
  {
    sourceEntityId,
    targetEntityId,
    projectId,
    userId,
  }: {
    sourceEntityId: string;
    targetEntityId: string;
    projectId: string;
    userId?: string | null;
  }
): Promise<{ error: string | null; sourceName?: string; targetName?: string }> {
  if (sourceEntityId === targetEntityId) {
    return { error: "같은 항목으로는 합칠 수 없습니다" };
  }

  const { data, error } = await supabase.rpc("merge_codex_entity_as_alias", {
    p_project_id: projectId,
    p_source_entity_id: sourceEntityId,
    p_target_entity_id: targetEntityId,
  });
  if (error) return { error: error.message };

  const merged = data?.[0];
  if (!merged) return { error: "항목 병합 결과를 확인할 수 없습니다" };

  const mergedAliases = normalizeAliases(merged.target_aliases);

  scheduleEntityEmbedding(targetEntityId, projectId, userId, {
    name: merged.target_name,
    summary: merged.target_summary,
    aliases: mergedAliases,
  });

  return {
    error: null,
    sourceName: merged.source_name,
    targetName: merged.target_name,
  };
}
