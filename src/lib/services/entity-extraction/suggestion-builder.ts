import type { EntitySuggestionInsert } from "@/types";
import type { ExtractedEntity, KnownEntity } from "../prompt-templates";
import { normalizeEntityType } from "../prompt-templates";
import { normalizeEntityName, normalizedNameSet } from "../entity-extraction-utils";

export type EntitySuggestionAction = "CREATE" | "MERGE" | "UPDATE";

export interface EntitySuggestionBuildContext {
  projectId: string;
  chapterId: string;
  knownEntities: KnownEntity[];
  updatedAt: string;
}

export function findKnownEntityIdByName(
  entities: KnownEntity[],
  name: string
): string | null {
  const target = normalizeEntityName(name);
  if (!target) return null;

  for (const entity of entities) {
    if (normalizeEntityName(entity.name) === target) {
      return entity.id ?? null;
    }
    for (const alias of entity.aliases ?? []) {
      if (normalizeEntityName(alias) === target) {
        return entity.id ?? null;
      }
    }
  }

  return null;
}

export function decideEntitySuggestionAction(
  entity: ExtractedEntity,
  knownEntityNames: Set<string>,
  knownEntities: KnownEntity[]
): {
  suggestedAction: EntitySuggestionAction;
  matchedEntityId: string | null;
} | null {
  if (entity.sub_type === "alias_ref") {
    const matchedEntityId = findKnownEntityIdByName(
      knownEntities,
      entity.alias_of ?? ""
    );
    if (!matchedEntityId) return null;

    return {
      suggestedAction: "MERGE",
      matchedEntityId,
    };
  }

  if (knownEntityNames.has(normalizeEntityName(entity.name))) {
    return {
      suggestedAction: "UPDATE",
      matchedEntityId: null,
    };
  }

  return {
    suggestedAction: "CREATE",
    matchedEntityId: null,
  };
}

export function buildEntitySuggestionInsert(
  entity: ExtractedEntity,
  context: EntitySuggestionBuildContext
): EntitySuggestionInsert | null {
  const knownEntityNames = normalizedNameSet(
    context.knownEntities.map((knownEntity) => knownEntity.name)
  );
  const decision = decideEntitySuggestionAction(
    entity,
    knownEntityNames,
    context.knownEntities
  );

  if (!decision) return null;

  return {
    project_id: context.projectId,
    chapter_id: context.chapterId,
    name: entity.name,
    type: normalizeEntityType(entity.type)!,
    summary: entity.summary || null,
    aliases: entity.aliases?.length ? entity.aliases : [],
    confidence: entity.confidence,
    context_snippet: entity.context_snippet || null,
    status: "PENDING",
    suggested_action: decision.suggestedAction,
    matched_entity_id: decision.matchedEntityId,
    updated_at: context.updatedAt,
  };
}

export function buildEntitySuggestionInserts(
  entities: ExtractedEntity[],
  context: EntitySuggestionBuildContext
): EntitySuggestionInsert[] {
  return entities.flatMap((entity) => {
    const insert = buildEntitySuggestionInsert(entity, context);
    return insert ? [insert] : [];
  });
}
