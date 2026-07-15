import type { ExtractedRelation } from "../prompt-templates";
import {
  hasCharacterRelationEvidence,
  isValidCrossTypeRelation,
  isValidRelationType,
} from "./relation-policy";

export interface RelationEntityMaps {
  nameToId: Map<string, string>;
  nameToType: Map<string, string>;
}

export function buildRelationEntityMaps(
  confirmedEntities: Array<{
    id: string;
    name: string;
    type: string;
    aliases: unknown;
  }>,
  normalizeName: (name: string) => string
): RelationEntityMaps {
  const nameToId = new Map<string, string>();
  const nameToType = new Map<string, string>();

  for (const entity of confirmedEntities) {
    nameToId.set(normalizeName(entity.name), entity.id);
    nameToType.set(normalizeName(entity.name), entity.type);
    if (Array.isArray(entity.aliases)) {
      for (const alias of entity.aliases as string[]) {
        if (alias) {
          nameToId.set(normalizeName(alias), entity.id);
          nameToType.set(normalizeName(alias), entity.type);
        }
      }
    }
  }

  return { nameToId, nameToType };
}

export function filterValidRelations(
  relations: ExtractedRelation[],
  context: {
    validEntityNames: Set<string>;
    normalizeName: (name: string) => string;
    nameToType: Map<string, string>;
    confirmedCount: number;
  }
): ExtractedRelation[] {
  const { validEntityNames, normalizeName, nameToType, confirmedCount } =
    context;

  console.log(
    `[EntityExtraction] insertRelationSuggestions: ${relations.length} total | validNames=${validEntityNames.size} | confirmedEntities=${confirmedCount}`
  );
  for (const relation of relations) {
    const fromType = nameToType.get(normalizeName(relation.from_name));
    const toType = nameToType.get(normalizeName(relation.to_name));
    const inValidNames =
      validEntityNames.has(normalizeName(relation.from_name)) &&
      validEntityNames.has(normalizeName(relation.to_name));
    const validType = isValidRelationType(relation.relation_type);
    console.log(
      `  [REL] "${relation.from_name}"(${fromType ?? "?"}) → "${relation.to_name}"(${toType ?? "?"}) [${relation.relation_type}] w=${relation.weight} | validType=${validType} inNames=${inValidNames}`
    );
  }

  const validRelations = relations.filter((relation) => {
    if (!isValidRelationType(relation.relation_type)) {
      console.log(
        `  [FILTER] invalid type: "${relation.from_name}" → "${relation.to_name}" [${relation.relation_type}]`
      );
      return false;
    }
    if (relation.weight < 0.5) {
      console.log(
        `  [FILTER] low weight: "${relation.from_name}" → "${relation.to_name}" w=${relation.weight}`
      );
      return false;
    }
    if (!validEntityNames.has(normalizeName(relation.from_name))) {
      console.log(
        `  [FILTER] from_name not in validNames: "${relation.from_name}"`
      );
      return false;
    }
    if (!validEntityNames.has(normalizeName(relation.to_name))) {
      console.log(
        `  [FILTER] to_name not in validNames: "${relation.to_name}"`
      );
      return false;
    }

    const fromType = nameToType.get(normalizeName(relation.from_name));
    const toType = nameToType.get(normalizeName(relation.to_name));
    if (
      fromType &&
      toType &&
      !isValidCrossTypeRelation(fromType, toType, relation.relation_type)
    ) {
      console.log(
        `  [FILTER] cross-type invalid: ${relation.from_name}(${fromType}) → ${relation.to_name}(${toType}) [${relation.relation_type}]`
      );
      return false;
    }
    if (
      fromType === "CHARACTER" &&
      toType === "CHARACTER" &&
      !hasCharacterRelationEvidence(
        relation.relation_type,
        relation.context_snippet
      )
    ) {
      console.log(
        `  [FILTER] weak character-character evidence: "${relation.from_name}" → "${relation.to_name}" [${relation.relation_type}]`
      );
      return false;
    }
    return true;
  });

  console.log(
    `[EntityExtraction] ${validRelations.length}/${relations.length} relations passed all filters`
  );
  return validRelations;
}
