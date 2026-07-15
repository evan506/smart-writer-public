import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { FactSuggestionInsert } from "@/types";
import type { ExtractedEntity, KnownEntity } from "../prompt-templates";
import { normalizeEntityName } from "../entity-extraction-utils";

export interface FactSuggestionWriteInput {
  projectId: string;
  chapterId: string;
  entities: ExtractedEntity[];
  entitySuggestionRefs: Map<
    string,
    {
      id: string;
      matched_entity_id: string | null;
    }
  >;
  knownEntities: KnownEntity[];
  autoConfirmedEntityIds: Map<string, string>;
}

export async function insertFactSuggestions(
  supabase: SupabaseClient<Database>,
  input: FactSuggestionWriteInput
): Promise<number> {
  const inserts = buildFactSuggestionInserts(input);
  if (inserts.length === 0) return 0;

  const existingKeys = await loadExistingPendingFactKeys(supabase, {
    projectId: input.projectId,
    chapterId: input.chapterId,
  });
  const newInserts = inserts.filter((insert) => !existingKeys.has(factInsertKey(insert)));
  if (newInserts.length === 0) return 0;

  const { data, error } = await supabase
    .from("fact_suggestions")
    .insert(newInserts)
    .select("id");

  if (error) {
    if ((error as { code?: string }).code === "23505") return 0;
    console.error("[EntityExtraction] fact suggestion upsert error:", error.message);
    return 0;
  }

  return data?.length ?? 0;
}

async function loadExistingPendingFactKeys(
  supabase: SupabaseClient<Database>,
  input: { projectId: string; chapterId: string }
): Promise<Set<string>> {
  const { data } = await supabase
    .from("fact_suggestions")
    .select("matched_entity_id, entity_suggestion_id, fact_type, fact_key, value")
    .eq("project_id", input.projectId)
    .eq("chapter_id", input.chapterId)
    .eq("status", "PENDING");

  return new Set(
    (data ?? []).map((row) =>
      [
        row.matched_entity_id ?? "",
        row.entity_suggestion_id ?? "",
        row.fact_type,
        row.fact_key ?? "",
        row.value,
      ].join("|")
    )
  );
}

function factInsertKey(insert: FactSuggestionInsert): string {
  return [
    insert.matched_entity_id ?? "",
    insert.entity_suggestion_id ?? "",
    insert.fact_type,
    insert.fact_key ?? "",
    insert.value,
  ].join("|");
}

export function buildFactSuggestionInserts(
  input: FactSuggestionWriteInput
): FactSuggestionInsert[] {
  const knownEntityIds = buildKnownEntityIdMap(input.knownEntities);

  return input.entities.flatMap((entity) => {
    if (!entity.facts?.length) return [];

    const suggestionRef = input.entitySuggestionRefs.get(entity.name);
    const matchedEntityId =
      input.autoConfirmedEntityIds.get(entity.name) ??
      suggestionRef?.matched_entity_id ??
      knownEntityIds.get(normalizeEntityName(entity.name)) ??
      null;

    return entity.facts.map((fact) => ({
      project_id: input.projectId,
      chapter_id: input.chapterId,
      entity_suggestion_id: suggestionRef?.id ?? null,
      matched_entity_id: matchedEntityId,
      fact_type: fact.fact_type,
      fact_key: fact.fact_key ?? null,
      value: fact.value,
      confidence: fact.confidence ?? entity.confidence,
      evidence_text: fact.evidence,
      status: "PENDING",
    }));
  });
}

function buildKnownEntityIdMap(entities: KnownEntity[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entity of entities) {
    if (!entity.id) continue;
    map.set(normalizeEntityName(entity.name), entity.id);
    for (const alias of entity.aliases ?? []) {
      map.set(normalizeEntityName(alias), entity.id);
    }
  }
  return map;
}
