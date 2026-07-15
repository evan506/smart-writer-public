import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { embedText } from "../embedding.service";
import { createLLMUsageLogger } from "../llm-usage-logger.service";
import type { ExtractedEntity } from "../prompt-templates";
import { normalizeEntityType } from "../prompt-templates";

export async function autoConfirmEntity(
  supabase: SupabaseClient<Database>,
  input: {
    entity: ExtractedEntity;
    projectId: string;
    chapterId: string;
  }
): Promise<string | null> {
  const { entity, projectId, chapterId } = input;
  const type = normalizeEntityType(entity.type);
  if (!type) return null;

  const { data: existing } = await supabase
    .from("entities")
    .select("id, summary, aliases")
    .eq("project_id", projectId)
    .eq("name", entity.name)
    .maybeSingle();

  const entityId = existing
    ? await updateExistingAutoConfirmedEntity(supabase, existing, entity)
    : await insertAutoConfirmedEntity(supabase, projectId, entity, type);

  if (!entityId) return null;

  const { error: upsertError } = await supabase.from("entity_suggestions").upsert(
    {
      project_id: projectId,
      chapter_id: chapterId,
      name: entity.name,
      type,
      summary: entity.summary || null,
      aliases: entity.aliases ?? [],
      confidence: entity.confidence,
      context_snippet: entity.context_snippet || null,
      status: "CONFIRMED",
      matched_entity_id: entityId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "chapter_id,name", ignoreDuplicates: false }
  );
  if (upsertError) {
    console.error(
      "[EntityExtraction] autoConfirm suggestion upsert error:",
      upsertError.message
    );
  }

  return entityId;
}

async function updateExistingAutoConfirmedEntity(
  supabase: SupabaseClient<Database>,
  existing: { id: string; summary: string | null; aliases: unknown },
  entity: ExtractedEntity
): Promise<string> {
  const existingAliases = Array.isArray(existing.aliases)
    ? (existing.aliases as string[])
    : [];
  const newAliases = entity.aliases ?? [];
  const mergedAliases = Array.from(new Set([...existingAliases, ...newAliases]));
  const mergedSummary =
    entity.summary &&
    (!existing.summary || entity.summary.length > existing.summary.length)
      ? entity.summary
      : existing.summary;

  const { error } = await supabase
    .from("entities")
    .update({ summary: mergedSummary, aliases: mergedAliases })
    .eq("id", existing.id);
  if (error) {
    console.error(
      "[EntityExtraction] autoConfirm merge update error:",
      error.message
    );
  }

  return existing.id;
}

async function insertAutoConfirmedEntity(
  supabase: SupabaseClient<Database>,
  projectId: string,
  entity: ExtractedEntity,
  type: NonNullable<ReturnType<typeof normalizeEntityType>>
): Promise<string | null> {
  const { data: newEntity, error } = await supabase
    .from("entities")
    .insert({
      project_id: projectId,
      name: entity.name,
      type,
      summary: entity.summary || null,
      aliases: entity.aliases ?? [],
      metadata: { importance: "MINOR" },
    })
    .select("id")
    .single();

  if (error || !newEntity) {
    console.error("[EntityExtraction] autoConfirm insert error:", error?.message);
    return null;
  }

  // Awaited on purpose: this whole pipeline already runs inside after(), and
  // a floating promise here can be killed when the serverless invocation
  // freezes after the after() callback resolves — silently dropping the
  // entity embedding. Embedding failure is still non-fatal for the entity.
  await updateEntityEmbedding(supabase, {
    entityId: newEntity.id,
    projectId,
    name: entity.name,
    summary: entity.summary,
    aliases: entity.aliases ?? [],
  });

  return newEntity.id;
}

async function updateEntityEmbedding(
  supabase: SupabaseClient<Database>,
  input: {
    entityId: string;
    projectId: string;
    name: string;
    summary: string;
    aliases: string[];
  }
): Promise<void> {
  const embeddingText = [input.name, input.summary, ...input.aliases]
    .filter(Boolean)
    .join(" ");
  try {
    const embedding = await embedText(embeddingText, {
      onComplete: createLLMUsageLogger(supabase, {
        projectId: input.projectId,
        feature: "embedding",
        promptTemplateKey: "extraction.auto_confirm_embedding",
        promptTemplateVersion: "v1",
      }),
    });
    const { error } = await supabase
      .from("entities")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", input.entityId);
    if (error) {
      console.error("[EntityExtraction] embedding update error:", error.message);
    }
  } catch (err) {
    console.error("[EntityExtraction] embedding error:", err);
  }
}
