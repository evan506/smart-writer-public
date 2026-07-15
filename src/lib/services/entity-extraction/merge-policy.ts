import { normalizeEntityName } from "../text-normalize";

export function canAutoMergeSubstringEntities(entityType: string): boolean {
  return entityType === "CHARACTER";
}

export function shouldAutoMergeCharacterSubstring(
  shorterName: string,
  longerName: string
): boolean {
  const shorter = normalizeEntityName(shorterName);
  const longer = normalizeEntityName(longerName);
  if (!shorter || !longer || shorter === longer) return false;

  // Keep this conservative: prefix abbreviations such as "리엔" →
  // "리엔 하르트" are safe enough to merge automatically, but title +
  // name expressions such as "강철주먹 카일" should remain author-reviewed.
  return longer.startsWith(shorter);
}
