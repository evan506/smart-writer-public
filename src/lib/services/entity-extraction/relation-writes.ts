import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntitySuggestionInsert } from "@/types";
import type { Database } from "@/types/database.types";
import type { ExtractedRelation } from "../prompt-templates";
import {
  loadExistingLinkDetails,
  loadExistingLinks,
} from "./db-boundaries";
import { isAutoRegisterableRelation } from "./relation-policy";
import {
  buildRelationEntityMaps,
  filterValidRelations,
} from "./relation-write-filters";

export async function insertRelationSuggestions(
  supabase: SupabaseClient<Database>,
  input: {
    projectId: string;
    chapterId: string;
    relations: ExtractedRelation[];
    validEntityNames: Set<string>;
    normalizeName: (name: string) => string;
  }
): Promise<number> {
  const { projectId, chapterId, relations, validEntityNames, normalizeName } =
    input;
  const { data: confirmedEntities } = await supabase
    .from("entities")
    .select("id, name, type, aliases")
    .eq("project_id", projectId);

  const entityMaps = buildRelationEntityMaps(
    confirmedEntities ?? [],
    normalizeName
  );

  const validRelations = filterValidRelations(relations, {
    validEntityNames,
    normalizeName,
    nameToType: entityMaps.nameToType,
    confirmedCount: confirmedEntities?.length ?? 0,
  });
  if (validRelations.length === 0) return 0;

  const { data: existingRelSuggestions } = await supabase
    .from("entity_suggestions")
    .select("name")
    .eq("project_id", projectId)
    .eq("type", "RELATION")
    .in("status", ["PENDING", "CONFIRMED", "DISMISSED"]);

  const existingRelNames = new Set(
    existingRelSuggestions?.map((suggestion) => suggestion.name) ?? []
  );
  const existingLinks = await loadExistingLinks(supabase, projectId);
  const existingLinkDetails = await loadExistingLinkDetails(supabase, projectId);

  let autoRegisteredCount = 0;
  const pendingInserts: EntitySuggestionInsert[] = [];

  for (const relation of validRelations) {
    const name = `${relation.from_name} → ${relation.to_name}`;

    if (existingRelNames.has(name)) continue;
    if (existingRelNames.has(`${relation.to_name} → ${relation.from_name}`)) {
      continue;
    }

    const key = `${relation.from_name}|${relation.to_name}|${relation.relation_type}`;
    const reverseKey = `${relation.to_name}|${relation.from_name}|${relation.relation_type}`;
    if (existingLinks.has(key) || existingLinks.has(reverseKey)) continue;

    const fromId = entityMaps.nameToId.get(normalizeName(relation.from_name));
    const toId = entityMaps.nameToId.get(normalizeName(relation.to_name));

    if (relation.conflict_note) {
      pendingInserts.push(
        buildRelationSuggestionInsert({
          projectId,
          chapterId,
          relation,
          name,
          summary: relation.conflict_note,
          status: "PENDING",
        })
      );
      continue;
    }

    if (fromId && toId) {
      const existingType =
        existingLinkDetails.get(`${fromId}|${toId}`) ??
        existingLinkDetails.get(`${toId}|${fromId}`);

      if (existingType && existingType !== relation.relation_type) {
        pendingInserts.push(
          buildRelationSuggestionInsert({
            projectId,
            chapterId,
            relation,
            name,
            summary: `기존: ${existingType}, 새: ${relation.relation_type}`,
            status: "PENDING",
          })
        );
      } else if (!existingType && isAutoRegisterableRelation(relation)) {
        const registered = await autoRegisterRelation(supabase, {
          projectId,
          chapterId,
          relation,
          name,
          fromId,
          toId,
        });
        if (registered) autoRegisteredCount++;
      } else if (!existingType) {
        pendingInserts.push(
          buildRelationSuggestionInsert({
            projectId,
            chapterId,
            relation,
            name,
            summary: relation.relation_type,
            status: "PENDING",
          })
        );
      }
    } else {
      pendingInserts.push(
        buildRelationSuggestionInsert({
          projectId,
          chapterId,
          relation,
          name,
          summary: relation.relation_type,
          status: "PENDING",
        })
      );
    }
  }

  if (autoRegisteredCount > 0) {
    console.log(
      `[EntityExtraction] auto-registered ${autoRegisteredCount} relations`
    );
  }

  if (pendingInserts.length === 0) return autoRegisteredCount;

  const { data, error } = await supabase
    .from("entity_suggestions")
    .upsert(pendingInserts, {
      onConflict: "chapter_id,name",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    console.error(
      "[EntityExtraction] relation suggestion upsert error:",
      error.message
    );
    return autoRegisteredCount;
  }

  return autoRegisteredCount + (data?.length ?? 0);
}

async function autoRegisterRelation(
  supabase: SupabaseClient<Database>,
  input: {
    projectId: string;
    chapterId: string;
    relation: ExtractedRelation;
    name: string;
    fromId: string;
    toId: string;
  }
): Promise<boolean> {
  const { projectId, chapterId, relation, name, fromId, toId } = input;
  const { error: linkError } = await supabase.from("entity_links").upsert(
    {
      from_id: fromId,
      to_id: toId,
      relation_type: relation.relation_type,
      direction: relation.direction === "BI" ? "BI" : "UNI",
      weight: relation.weight,
    },
    { onConflict: "from_id,to_id,relation_type", ignoreDuplicates: true }
  );

  if (linkError) return false;

  const { error: suggestionError } = await supabase
    .from("entity_suggestions")
    .upsert(
      buildRelationSuggestionInsert({
        projectId,
        chapterId,
        relation,
        name,
        summary: relation.relation_type,
        status: "CONFIRMED",
      }),
      { onConflict: "chapter_id,name", ignoreDuplicates: false }
    );
  if (suggestionError) {
    // Link row already exists; only the audit-trail suggestion failed.
    console.error(
      "[EntityExtraction] auto-register suggestion upsert error:",
      suggestionError.message
    );
  }

  return true;
}

function buildRelationSuggestionInsert(input: {
  projectId: string;
  chapterId: string;
  relation: ExtractedRelation;
  name: string;
  summary: string;
  status: "PENDING" | "CONFIRMED";
}): EntitySuggestionInsert {
  const { projectId, chapterId, relation, name, summary, status } = input;
  return {
    project_id: projectId,
    chapter_id: chapterId,
    name,
    type: "RELATION",
    summary,
    aliases: {
      from_name: relation.from_name,
      to_name: relation.to_name,
      relation_type: relation.relation_type,
      direction: relation.direction,
      weight: relation.weight,
    },
    confidence: relation.weight,
    context_snippet: relation.context_snippet || null,
    status,
    updated_at: new Date().toISOString(),
  };
}
