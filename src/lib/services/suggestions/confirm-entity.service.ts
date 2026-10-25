import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LLMBudgetError } from "../llm-budget.service";
import { createBudgetedEmbeddingOptions } from "../budgeted-embedding";
import { embedText } from "../embedding.service";
import { mergeAliasValues } from "@/lib/services/suggestion-action-utils";
import type { EntityType } from "@/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type ConfirmEntitySuggestionRow = {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  aliases: unknown;
};

export type ConfirmEntitySuggestionOverrides = {
  name?: string;
  type?: EntityType;
  summary?: string;
  aliases?: string[];
};

export async function confirmEntitySuggestion(
  supabase: SupabaseClient,
  suggestion: ConfirmEntitySuggestionRow,
  projectId: string,
  overrides?: ConfirmEntitySuggestionOverrides,
  userId?: string | null
): Promise<{ error: string | null; entityId?: string }> {
  const name = overrides?.name ?? suggestion.name;
  const type = overrides?.type ?? suggestion.type;
  const summary = overrides?.summary ?? suggestion.summary;
  const aliases = overrides?.aliases ??
    (Array.isArray(suggestion.aliases) ? suggestion.aliases : []);

  const { data: existing } = await supabase
    .from("entities")
    .select("id, summary, aliases")
    .eq("project_id", projectId)
    .eq("name", name)
    .maybeSingle();

  let entityId: string;

  if (existing) {
    const mergedAliases = mergeAliasValues(existing.aliases, aliases as string[]);
    const mergedSummary =
      summary && (!existing.summary || summary.length > existing.summary.length)
        ? summary
        : existing.summary;

    const { error: mergeError } = await supabase
      .from("entities")
      .update({ summary: mergedSummary, aliases: mergedAliases })
      .eq("id", existing.id);
    if (mergeError) return { error: mergeError.message };

    entityId = existing.id;
  } else {
    const { data: entity, error: insertError } = await supabase
      .from("entities")
      .insert({ project_id: projectId, name, type, summary, aliases, metadata: { importance: "MINOR" } })
      .select("id")
      .single();

    if (insertError) return { error: insertError.message };
    entityId = entity.id;

    after(async () => {
      try {
        const embeddingText = [name, summary, ...(aliases as string[])]
          .filter(Boolean)
          .join(" ");
        const bgSupabase = await createClient();
        const embedding = await embedText(embeddingText, createBudgetedEmbeddingOptions(bgSupabase, {
          projectId: projectId ?? "",
          userId,
          feature: "embedding",
          promptTemplateKey: "suggestions.entity_embedding",
          promptTemplateVersion: "v1",
        }));
        const { error: embeddingError } = await bgSupabase
          .from("entities")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", entityId);
        if (embeddingError) {
          console.error("[Suggestions] embedding update error:", embeddingError.message);
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

  const { error: statusError } = await supabase
    .from("entity_suggestions")
    .update({
      status: "CONFIRMED",
      matched_entity_id: entityId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id);

  if (statusError) return { error: statusError.message };

  return { error: null, entityId };
}
