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
  entities: Array<{ id?: string; name: string; aliases?: unknown }>,
  name: string
): string | null {
  const target = normalizeEntityName(name);
  if (!target) return null;

  const matches = entities.filter((entity) =>
    [entity.name, ...(Array.isArray(entity.aliases) ? entity.aliases.filter((alias): alias is string => typeof alias === "string") : [])].some(
      (value) => normalizeEntityName(value) === target
    )
  );
  const ids = new Set(matches.map((entity) => entity.id).filter(Boolean));
  return ids.size === 1 ? [...ids][0]! : null;
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

    return {
      suggestedAction: "MERGE",
      matchedEntityId,
    };
  }

  const matchedEntityId = findKnownEntityIdByName(knownEntities, entity.name);
  if (matchedEntityId) {
    const canonical = knownEntities.find((known) => known.id === matchedEntityId)!;
    return {
      suggestedAction: canonical.name === entity.name ? "UPDATE" : "MERGE",
      matchedEntityId,
    };
  }
  const hasIdentityMatch = knownEntities.some((known) =>
    [known.name, ...(known.aliases ?? [])].some(
      (name) => normalizeEntityName(name) === normalizeEntityName(entity.name)
    )
  );
  if (hasIdentityMatch || knownEntityNames.has(normalizeEntityName(entity.name))) {
    return { suggestedAction: "MERGE", matchedEntityId: null };
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
