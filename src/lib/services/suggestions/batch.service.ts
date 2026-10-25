import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LLMBudgetError } from "../llm-budget.service";
import { createBudgetedEmbeddingOptions } from "../budgeted-embedding";
import { embedText } from "../embedding.service";
import {
  buildEntityBatchConfirmationPlan,
  getInsertedEntitySuggestionIds,
} from "@/lib/services/suggestion-action-utils";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type EntitySuggestionBatchRow = {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  aliases: unknown;
  matched_entity_id?: string | null;
  suggested_action?: string | null;
};

export type EntitySuggestionBatchResult = {
  error: string | null;
  confirmed: number;
  skippedMerge: number;
};

export async function confirmEntitySuggestionBatch(
  supabase: SupabaseClient,
  suggestions: EntitySuggestionBatchRow[],
  projectId: string,
  userId?: string | null
): Promise<EntitySuggestionBatchResult> {
  const skippedMerge = suggestions.filter((suggestion) => suggestion.suggested_action === "MERGE").length;
  const confirmableCount = suggestions.length - skippedMerge;

  if (confirmableCount === 0) {
    return { error: null, confirmed: 0, skippedMerge };
  }

  const names = Array.from(
    new Set(
      suggestions
        .filter((suggestion) => suggestion.suggested_action !== "MERGE")
        .map((suggestion) => suggestion.name)
    )
  );
  const { data: existingRows, error: existingError } = await supabase
    .from("entities")
    .select("id, name, summary, aliases")
    .eq("project_id", projectId)
    .in("name", names);

  if (existingError) return { error: existingError.message, confirmed: 0, skippedMerge };

  const plan = buildEntityBatchConfirmationPlan(suggestions, existingRows ?? [], projectId);
  const statusGroups = plan.statusGroups;
  const now = new Date().toISOString();

  const existingUpdates = plan.existingUpdates.map((update) =>
    supabase
      .from("entities")
      .update(update.values)
      .eq("id", update.entityId)
  );

  const updateResults = await Promise.all(existingUpdates);
  const updateError = updateResults.find((result) => result.error)?.error;
  if (updateError) return { error: updateError.message, confirmed: 0, skippedMerge };

  if (plan.newRows.length > 0) {
    const { data: inserted, error: insertError } = await supabase
      .from("entities")
      .insert(plan.newRows)
      .select("id, name, summary, aliases");

    if (insertError) return { error: insertError.message, confirmed: 0, skippedMerge };

    for (const entity of inserted ?? []) {
      const suggestionIds = getInsertedEntitySuggestionIds(suggestions, entity.name);
      statusGroups.set(entity.id, suggestionIds);
    }

    after(async () => {
      try {
        const bgSupabase = await createClient();
        // Keep one logging state across the batch so a failed cost write stops later calls.
        const embedOptions = createBudgetedEmbeddingOptions(bgSupabase, {
          projectId,
          userId,
          feature: "embedding",
          promptTemplateKey: "suggestions.entity_embedding",
          promptTemplateVersion: "v1",
        });
        for (const entity of inserted ?? []) {
          const aliases = Array.isArray(entity.aliases) ? (entity.aliases as string[]) : [];
          const embeddingText = [entity.name, entity.summary, ...aliases]
            .filter(Boolean)
            .join(" ");
          const embedding = await embedText(embeddingText, embedOptions);
          const { error: embeddingError } = await bgSupabase
            .from("entities")
            .update({ embedding: JSON.stringify(embedding) })
            .eq("id", entity.id);
          if (embeddingError) {
            console.error("[Suggestions] embedding update error:", embeddingError.message);
          }
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

  const statusUpdates = Array.from(statusGroups.entries()).map(([entityId, suggestionIds]) =>
    supabase
      .from("entity_suggestions")
      .update({
        status: "CONFIRMED",
        matched_entity_id: entityId,
        updated_at: now,
      })
      .in("id", suggestionIds)
  );

  const statusResults = await Promise.all(statusUpdates);
  const statusError = statusResults.find((result) => result.error)?.error;
  if (statusError) return { error: statusError.message, confirmed: 0, skippedMerge };

  return { error: null, confirmed: plan.confirmed, skippedMerge: plan.skippedMerge };
}
