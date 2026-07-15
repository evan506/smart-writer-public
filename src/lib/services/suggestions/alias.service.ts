import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createLLMUsageLogger } from "../llm-usage-logger.service";
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
  projectId?: string
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
    const embeddingText = [target.name, target.summary, ...mergedAliases]
      .filter(Boolean)
      .join(" ");
    const bgSupabase = await createClient();
    const embedding = await embedText(embeddingText, {
      onComplete: projectId
        ? createLLMUsageLogger(bgSupabase, {
            projectId,
            feature: "embedding",
            promptTemplateKey: "suggestions.entity_embedding",
            promptTemplateVersion: "v1",
          })
        : undefined,
    });
    const { error: embeddingError } = await bgSupabase
      .from("entities")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", target.id);
    if (embeddingError) {
      console.error("[Suggestions] embedding update error:", embeddingError.message);
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
