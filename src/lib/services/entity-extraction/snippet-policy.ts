import { hasAnyCharacterRelationEvidence } from "./relation-policy";

export type CoOccurrenceEntity = {
  name: string;
  type: string;
};

export type CoOccurrenceSnippet = {
  nameA: string;
  nameB: string;
  snippet: string;
};

export type EntityWithContextSnippet = {
  name: string;
  context_snippet?: string;
};

function normalizeEvidenceText(text: string): string {
  return text
    .replace(/["'“”‘’]/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

export function sourceContainsEvidenceSnippet(
  sourceText: string,
  snippet: string | null | undefined
): boolean {
  const normalizedSnippet = normalizeEvidenceText(snippet ?? "");
  if (!normalizedSnippet) return false;
  return normalizeEvidenceText(sourceText).includes(normalizedSnippet);
}

export function extractContextSnippets(
  text: string,
  name: string,
  maxSnippets: number = 2
): string[] {
  const snippets: string[] = [];
  const normalizedText = text.replace(/\s+/g, " ").trim();
  if (!normalizedText || !name) return snippets;

  let searchFrom = 0;
  let idx = normalizedText.indexOf(name, searchFrom);

  while (idx !== -1 && snippets.length < maxSnippets) {
    const before = normalizedText.slice(0, idx);
    const after = normalizedText.slice(idx + name.length);
    const prevBoundary = Math.max(
      before.lastIndexOf("."),
      before.lastIndexOf("?"),
      before.lastIndexOf("!"),
      before.lastIndexOf("。"),
      before.lastIndexOf("？"),
      before.lastIndexOf("！")
    );
    const nextBoundaryOffsets = [".", "?", "!", "。", "？", "！"]
      .map((mark) => after.indexOf(mark))
      .filter((offset) => offset !== -1);
    const start = prevBoundary === -1 ? Math.max(0, idx - 100) : prevBoundary + 1;
    const end =
      nextBoundaryOffsets.length === 0
        ? Math.min(normalizedText.length, idx + name.length + 100)
        : idx + name.length + Math.min(...nextBoundaryOffsets) + 1;
    const snippet = normalizedText.slice(start, end).trim();

    if (snippet && !snippets.includes(snippet)) snippets.push(snippet);
    searchFrom = idx + name.length;
    idx = normalizedText.indexOf(name, searchFrom);
  }

  return snippets;
}

export function attachFallbackContextSnippets<T extends EntityWithContextSnippet>(
  entities: T[],
  snippetMap: Map<string, string>
): T[] {
  return entities.map((entity) => ({
    ...entity,
    context_snippet: entity.context_snippet || snippetMap.get(entity.name) || "",
  }));
}

export function extractCoOccurrenceSnippets(
  text: string,
  entities: CoOccurrenceEntity[],
  options?: {
    range?: number;
    maxSnippetsPerPair?: number;
    maxTotal?: number;
    maxChars?: number;
  }
): CoOccurrenceSnippet[] {
  const range = options?.range ?? 200;
  const maxSnippetsPerPair = options?.maxSnippetsPerPair ?? 1;
  const maxTotal = options?.maxTotal ?? 20;
  const maxChars = options?.maxChars ?? 4000;

  const positions = new Map<string, number[]>();
  const entityTypeByName = new Map(
    entities.map((entity) => [entity.name, entity.type])
  );

  for (const { name } of entities) {
    const idxs: number[] = [];
    let idx = text.indexOf(name);
    while (idx !== -1) {
      idxs.push(idx);
      idx = text.indexOf(name, idx + 1);
    }
    if (idxs.length > 0) positions.set(name, idxs);
  }

  const results: CoOccurrenceSnippet[] = [];
  const seenPairs = new Set<string>();
  const names = [...positions.keys()];
  let totalChars = 0;

  for (
    let i = 0;
    i < names.length && results.length < maxTotal && totalChars < maxChars;
    i++
  ) {
    for (
      let j = i + 1;
      j < names.length && results.length < maxTotal && totalChars < maxChars;
      j++
    ) {
      const nameA = names[i];
      const nameB = names[j];
      const pairKey = [nameA, nameB].sort().join("|||");
      if (seenPairs.has(pairKey)) continue;

      const posA = positions.get(nameA)!;
      const posB = positions.get(nameB)!;
      let snippetCount = 0;

      for (const pA of posA) {
        if (snippetCount >= maxSnippetsPerPair) break;
        for (const pB of posB) {
          if (snippetCount >= maxSnippetsPerPair) break;
          if (Math.abs(pA - pB) > range) continue;

          const start = Math.max(0, Math.min(pA, pB) - 50);
          const end = Math.min(
            text.length,
            Math.max(pA + nameA.length, pB + nameB.length) + 50
          );
          const snippet = text.substring(start, end);
          const isCharacterPair =
            entityTypeByName.get(nameA) === "CHARACTER" &&
            entityTypeByName.get(nameB) === "CHARACTER";

          if (isCharacterPair && !hasAnyCharacterRelationEvidence(snippet)) {
            continue;
          }

          results.push({ nameA, nameB, snippet });
          totalChars += snippet.length;
          snippetCount++;
        }
      }

      if (snippetCount > 0) seenPairs.add(pairKey);
    }
  }

  return results;
}
