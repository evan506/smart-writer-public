import { normalizeEntityName } from "../text-normalize";

export function shouldAutoMergeCharacterSubstring(
  shorterName: string,
  longerName: string
): boolean {
  const shorter = normalizeEntityName(shorterName);
  const longer = normalizeEntityName(longerName);
  if (!shorter || !longer || shorter === longer) return false;

  // Used only to distinguish prefix names from same-batch title aliases.
  // Matching this pattern never permits canon writes or automatic merging.
  return longer.startsWith(shorter);
}
