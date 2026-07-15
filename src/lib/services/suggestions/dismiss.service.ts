import { createClient } from "@/lib/supabase/server";
import { appendExcludedTerm } from "@/lib/services/suggestion-action-utils";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type DismissSuggestionRow = {
  id: string;
  name: string;
};

export async function dismissSuggestionById(
  supabase: SupabaseClient,
  suggestionId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("entity_suggestions")
    .update({
      status: "DISMISSED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestionId);

  if (error) return { error: error.message };

  return { error: null };
}

export async function dismissSuggestionAndAppendExcludedTerm(
  supabase: SupabaseClient,
  suggestion: DismissSuggestionRow,
  projectId: string
): Promise<{ error: string | null }> {
  const dismissResult = await dismissSuggestionById(supabase, suggestion.id);
  if (dismissResult.error) return dismissResult;

  const { data: project } = await supabase
    .from("projects")
    .select("excluded_terms")
    .eq("id", projectId)
    .single();

  const nextExcluded = appendExcludedTerm(project?.excluded_terms, suggestion.name);

  if (nextExcluded !== project?.excluded_terms) {
    const { error: excludeError } = await supabase
      .from("projects")
      .update({ excluded_terms: nextExcluded })
      .eq("id", projectId);

    if (excludeError) return { error: excludeError.message };
  }

  return { error: null };
}

export async function dismissPendingSuggestionsForProject(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("entity_suggestions")
    .update({
      status: "DISMISSED",
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId)
    .eq("status", "PENDING");

  if (error) return { error: error.message };

  return { error: null };
}
