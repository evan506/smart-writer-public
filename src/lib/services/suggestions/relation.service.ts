import { createClient } from "@/lib/supabase/server";
import { buildRelationBatchConfirmationPlan } from "@/lib/services/suggestion-action-utils";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type RelationSuggestionRow = {
  id: string;
  aliases: unknown;
  name?: string;
};

export async function confirmRelationSuggestion(
  supabase: SupabaseClient,
  suggestion: RelationSuggestionRow,
  projectId: string
): Promise<{ error: string | null }> {
  const meta = suggestion.aliases as {
    from_name: string;
    to_name: string;
    relation_type: string;
    direction: string;
    weight: number;
  } | null;

  if (!meta?.from_name || !meta?.to_name) {
    return { error: "관계 메타데이터가 올바르지 않습니다" };
  }

  const { data: entities } = await supabase
    .from("entities")
    .select("id, name")
    .eq("project_id", projectId)
    .in("name", [meta.from_name, meta.to_name]);

  const nameToId = new Map<string, string>();
  if (entities) {
    for (const entity of entities) {
      nameToId.set(entity.name, entity.id);
    }
  }

  const fromId = nameToId.get(meta.from_name);
  const toId = nameToId.get(meta.to_name);

  if (!fromId || !toId) {
    const missing = [];
    if (!fromId) missing.push(meta.from_name);
    if (!toId) missing.push(meta.to_name);
    return { error: `작품 기억 항목을 찾을 수 없습니다: ${missing.join(", ")}. 먼저 해당 작품 기억 항목을 저장하세요.` };
  }

  const { error: linkError } = await supabase
    .from("entity_links")
    .upsert(
      {
        from_id: fromId,
        to_id: toId,
        relation_type: meta.relation_type,
        direction: meta.direction === "BI" ? "BI" : "UNI",
        weight: meta.weight ?? 0.5,
      },
      { onConflict: "from_id,to_id,relation_type", ignoreDuplicates: true }
    );

  if (linkError) return { error: linkError.message };

  const { error: statusError } = await supabase
    .from("entity_suggestions")
    .update({
      status: "CONFIRMED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", suggestion.id);

  if (statusError) return { error: statusError.message };

  return { error: null };
}

export async function confirmRelationSuggestionBatch(
  supabase: SupabaseClient,
  suggestions: RelationSuggestionRow[],
  projectId: string
): Promise<{ error: string | null; confirmed: number }> {
  if (suggestions.length === 0) return { error: null, confirmed: 0 };

  const { data: entities, error: entitiesError } = await supabase
    .from("entities")
    .select("id, name")
    .eq("project_id", projectId);

  if (entitiesError) return { error: entitiesError.message, confirmed: 0 };

  const { linkInserts, confirmedIds, dismissedIds } = buildRelationBatchConfirmationPlan(
    suggestions,
    entities ?? []
  );

  if (linkInserts.length > 0) {
    const { error: linkError } = await supabase
      .from("entity_links")
      .upsert(linkInserts, {
        onConflict: "from_id,to_id,relation_type",
        ignoreDuplicates: true,
      });
    if (linkError) return { error: linkError.message, confirmed: 0 };
  }

  const now = new Date().toISOString();
  const updates = [];
  if (confirmedIds.length > 0) {
    updates.push(
      supabase
        .from("entity_suggestions")
        .update({ status: "CONFIRMED", updated_at: now })
        .in("id", confirmedIds)
    );
  }
  if (dismissedIds.length > 0) {
    updates.push(
      supabase
        .from("entity_suggestions")
        .update({ status: "DISMISSED", updated_at: now })
        .in("id", dismissedIds)
    );
  }

  const updateResults = await Promise.all(updates);
  const updateError = updateResults.find((result) => result.error)?.error;
  if (updateError) return { error: updateError.message, confirmed: 0 };

  return { error: null, confirmed: confirmedIds.length };
}
