import type { ExtractedEntity } from "../prompt-templates";
import { shouldAutoMergeCharacterSubstring } from "./merge-policy";

import { normalizeEntityName } from "../text-normalize";

export function linkSameBatchCharacterAliasRefs(
  entities: ExtractedEntity[]
): ExtractedEntity[] {
  const characterEntities = entities.filter(
    (entity) => entity.type === "CHARACTER" && entity.sub_type !== "alias_ref"
  );

  return entities.map((entity) => {
    if (entity.type !== "CHARACTER" || entity.sub_type === "alias_ref") {
      return entity;
    }

    const entityName = normalizeEntityName(entity.name);
    const aliasTarget = characterEntities
      .filter((candidate) => candidate.name !== entity.name)
      .filter((candidate) => {
        const candidateName = normalizeEntityName(candidate.name);
        if (!candidateName || candidateName.length < 2) return false;
        if (!entityName.endsWith(candidateName)) return false;
        return !shouldAutoMergeCharacterSubstring(candidate.name, entity.name);
      })
      .sort(
        (a, b) => normalizeEntityName(b.name).length - normalizeEntityName(a.name).length
      )[0];

    if (!aliasTarget) return entity;

    return {
      ...entity,
      sub_type: "alias_ref",
      alias_of: aliasTarget.name,
    };
  });
}
