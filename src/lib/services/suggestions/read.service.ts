import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function listPendingSuggestions(
  supabase: SupabaseClient,
  projectId: string
) {
  const { data, error } = await supabase
    .from("entity_suggestions")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "PENDING")
    .order("confidence", { ascending: false });

  if (error) return { error: error.message, suggestions: [] };
  return { error: null, suggestions: data ?? [] };
}

export async function countPendingSuggestions(
  supabase: SupabaseClient,
  projectId: string
) {
  const { count, error } = await supabase
    .from("entity_suggestions")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("status", "PENDING");

  if (error) return 0;
  return count ?? 0;
}

export async function listSuggestionAliasTargets(
  supabase: SupabaseClient,
  projectId: string
) {
  const { data, error } = await supabase
    .from("entities")
    .select("id, name, type, aliases")
    .eq("project_id", projectId)
    .order("type")
    .order("name");

  if (error) return { error: error.message, entities: [] };

  return {
    error: null,
    entities: (data ?? []).map((entity) => ({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      aliases: Array.isArray(entity.aliases) ? (entity.aliases as string[]) : [],
    })),
  };
}

export async function getChapterExtractionSummary(
  supabase: SupabaseClient,
  projectId: string,
  chapterId: string,
  since?: string
) {
  let query = supabase
    .from("entity_suggestions")
    .select("id, name, type, status, updated_at, created_at")
    .eq("project_id", projectId)
    .eq("chapter_id", chapterId);

  if (since) {
    query = query.gte("updated_at", since);
  }

  const { data, error } = await query;

  if (error) {
    return {
      error: error.message,
      pendingCount: 0,
      autoConfirmedEntityCount: 0,
      autoConfirmedRelationCount: 0,
      confirmedNames: [] as string[],
    };
  }

  const rows = data ?? [];
  const pending = rows.filter((row) => row.status === "PENDING");
  const confirmed = rows.filter((row) => row.status === "CONFIRMED");
  const confirmedEntities = confirmed.filter((row) => row.type !== "RELATION");
  const confirmedRelations = confirmed.filter((row) => row.type === "RELATION");

  return {
    error: null,
    pendingCount: pending.length,
    autoConfirmedEntityCount: confirmedEntities.length,
    autoConfirmedRelationCount: confirmedRelations.length,
    confirmedNames: confirmedEntities.map((row) => row.name).slice(0, 5),
  };
}
