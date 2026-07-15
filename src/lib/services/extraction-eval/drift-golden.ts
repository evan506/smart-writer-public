// Build a DRIFT golden from a prior extraction-run result (e.g.
// references/test-data/sample/sample-extraction-result.json).
//
// HONESTY: this is NOT a correctness golden. The "expected" names are the
// extractor's OWN past output, so scoring against them measures drift /
// consistency ("does the extractor still surface what it used to on this real
// text?") — exactly the regression a prompt/logic change can introduce — NOT
// whether that past output was correct. There are no reliable dismiss labels
// here, so `shouldNotExtract` is empty and precision is not meaningfully
// measured; this baseline is recall/drift-only. A true quality golden needs
// human confirm/dismiss labels (mine a live project or review held-out text).

import type { GoldenScenario } from "./types";

export interface ExtractionResultEntity {
  name: string;
  status?: string;
  first_chapter?: number;
}

export interface ExtractionResultLike {
  entities: ExtractionResultEntity[];
}

/**
 * One drift scenario per chapter: shouldExtract = names of entities the prior
 * run introduced in that chapter (`first_chapter`). Chapters with no attributed
 * entities or no text are skipped.
 */
export function buildDriftGoldenFromResult(input: {
  label: string;
  result: ExtractionResultLike;
  chapters: { num: number; content: string }[];
  autoConfirmedOnly?: boolean;
}): GoldenScenario[] {
  const namesByChapter = new Map<number, string[]>();
  for (const entity of input.result.entities) {
    if (input.autoConfirmedOnly && entity.status !== "auto_confirmed") continue;
    if (typeof entity.first_chapter !== "number") continue;
    const name = entity.name?.trim();
    if (!name) continue;
    const list = namesByChapter.get(entity.first_chapter) ?? [];
    list.push(name);
    namesByChapter.set(entity.first_chapter, list);
  }

  const scenarios: GoldenScenario[] = [];
  for (const chapter of input.chapters) {
    const content = chapter.content?.trim();
    if (!content) continue;
    const names = namesByChapter.get(chapter.num);
    if (!names || names.length === 0) continue;

    scenarios.push({
      id: `drift:${input.label}:ch${chapter.num}`,
      source: `drift ${input.label} chapter:${chapter.num} (prior-run output, recall-only)`,
      chapterText: content,
      shouldExtract: Array.from(new Set(names)),
      shouldNotExtract: [],
    });
  }

  return scenarios;
}
