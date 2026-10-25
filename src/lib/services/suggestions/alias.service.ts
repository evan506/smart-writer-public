import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LLMBudgetError } from "../llm-budget.service";
import { createBudgetedEmbeddingOptions } from "../budgeted-embedding";
import { embedText } from "../embedding.service";
import { mergeAliasValues } from "@/lib/services/suggestion-action-utils";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type AliasSuggestionRow = {
  id: string;
  name: string;
  aliases: unknown;
};

export type AliasTargetRow = {
  id: string;
  name: string;
  summary: string | null;
  aliases: unknown;
};

export async function confirmSuggestionAlias(
  supabase: SupabaseClient,
  suggestion: AliasSuggestionRow,
  target: AliasTargetRow,
  projectId?: string,
  userId?: string | null
): Promise<{ error: string | null; targetName?: string }> {
  const suggestionAliases = Array.isArray(suggestion.aliases)
    ? (suggestion.aliases as string[])
    : [];
  const mergedAliases = mergeAliasValues(target.aliases, [
    suggestion.name,
    ...suggestionAliases,
  ]);

  const { error: updateError } = await supabase
    .from("entities")
    .update({ aliases: mergedAliases })
    .eq("id", target.id);

  if (updateError) return { error: updateError.message };

  const { error: statusError } = await supabase
    .from("entity_suggestions")
    .update({
      status: "CONFIRMED",
      matched_entity_id: target.id,
      suggested_action: "MERGE",
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id);

  if (statusError) return { error: statusError.message };

  after(async () => {
    try {
      const embeddingText = [target.name, target.summary, ...mergedAliases]
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
        .eq("id", target.id);
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

  return { error: null, targetName: target.name };
}

export async function rejectSuggestionAliasTarget(
  supabase: SupabaseClient,
  suggestionId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("entity_suggestions")
    .update({
      matched_entity_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);

  if (error) return { error: error.message };

  return { error: null };
}
