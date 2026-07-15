import type { ExtractedEntity, ExtractedRelation } from "../prompt-templates";

export function mergeEntities(entities: ExtractedEntity[]): {
  entities: ExtractedEntity[];
  nameMap: Map<string, string>;
} {
  const map = new Map<string, ExtractedEntity>();
  const aliasIndex = new Map<string, string>();

  for (const e of entities) {
    let canonicalName: string | null = map.has(e.name) ? e.name : null;

    if (!canonicalName && aliasIndex.has(e.name)) {
      canonicalName = aliasIndex.get(e.name)!;
    }

    if (!canonicalName && e.aliases?.length) {
      for (const alias of e.aliases) {
        if (map.has(alias)) {
          canonicalName = alias;
          break;
        }
        if (aliasIndex.has(alias)) {
          canonicalName = aliasIndex.get(alias)!;
          break;
        }
      }
    }

    if (!canonicalName) {
      map.set(e.name, { ...e });
      if (e.aliases?.length) {
        for (const alias of e.aliases) {
          aliasIndex.set(alias, e.name);
        }
      }
      continue;
    }

    const existing = map.get(canonicalName)!;

    if (e.name.length > existing.name.length && e.confidence >= existing.confidence) {
      map.delete(canonicalName);
      const newAliases = new Set([...(existing.aliases ?? []), ...(e.aliases ?? []), canonicalName]);
      newAliases.delete(e.name);
      existing.name = e.name;
      existing.aliases = Array.from(newAliases);
      map.set(e.name, existing);
      for (const alias of existing.aliases) {
        aliasIndex.set(alias, e.name);
      }
      aliasIndex.set(canonicalName, e.name);
    } else {
      if (e.name !== canonicalName) {
        const aliasSet = new Set([...(existing.aliases ?? []), e.name]);
        aliasSet.delete(canonicalName);
        existing.aliases = Array.from(aliasSet);
        aliasIndex.set(e.name, canonicalName);
      }
    }

    if (e.confidence > existing.confidence) {
      existing.type = e.type;
      existing.confidence = e.confidence;
    }
    if (e.summary) existing.summary = e.summary;
    if (e.context_snippet) existing.context_snippet = e.context_snippet;
    if (e.aliases?.length) {
      const aliasSet = new Set([...(existing.aliases ?? []), ...e.aliases]);
      aliasSet.delete(existing.name);
      existing.aliases = Array.from(aliasSet);
      for (const alias of e.aliases) {
        aliasIndex.set(alias, existing.name);
      }
    }
  }

  const nameMap = new Map<string, string>(aliasIndex);
  for (const name of map.keys()) {
    nameMap.set(name, name);
  }

  return { entities: Array.from(map.values()), nameMap };
}

export function mergeRelations(relations: ExtractedRelation[]): ExtractedRelation[] {
  const map = new Map<string, ExtractedRelation>();

  for (const relation of relations) {
    const key = `${relation.from_name}|${relation.to_name}|${relation.relation_type}`;
    const existing = map.get(key);
    if (!existing || relation.weight > existing.weight) {
      map.set(key, { ...relation });
    }
  }

  return Array.from(map.values());
}

export function resolveRelationConflicts(relations: ExtractedRelation[]): ExtractedRelation[] {
  const directionalTypes = new Set(["SERVES", "MENTOR_OF", "LEADER_OF"]);
  const byPair = new Map<string, ExtractedRelation[]>();

  for (const relation of relations) {
    const key = [relation.from_name, relation.to_name].sort().join("|||");
    const current = byPair.get(key) ?? [];
    current.push(relation);
    byPair.set(key, current);
  }

  const result: ExtractedRelation[] = [];

  for (const rels of byPair.values()) {
    if (rels.length === 1) {
      result.push(rels[0]);
      continue;
    }

    const types = new Set(rels.map((relation) => relation.relation_type));
    const handled = new Set<ExtractedRelation>();

    if (types.has("ALLY") && types.has("ENEMY")) {
      for (const relation of rels) {
        result.push({ ...relation, conflict_note: "ALLY/ENEMY 충돌 — 작가 판단 필요" });
        handled.add(relation);
      }
      continue;
    }

    for (const relation of rels) {
      if (handled.has(relation)) continue;
      if (!directionalTypes.has(relation.relation_type)) continue;

      const reverse = rels.find(
        (other) =>
          !handled.has(other) &&
          other !== relation &&
          other.from_name === relation.to_name &&
          other.to_name === relation.from_name &&
          other.relation_type === relation.relation_type
      );

      if (reverse) {
        result.push({
          ...relation,
          conflict_note: `${relation.relation_type} 방향 충돌 — 작가 판단 필요`,
        });
        result.push({
          ...reverse,
          conflict_note: `${relation.relation_type} 방향 충돌 — 작가 판단 필요`,
        });
        handled.add(relation);
        handled.add(reverse);
      }
    }

    const remaining = rels.filter((relation) => !handled.has(relation));
    if (remaining.length > 0) {
      remaining.sort((a, b) => b.weight - a.weight);
      result.push(remaining[0]);
    }
  }

  return result;
}
