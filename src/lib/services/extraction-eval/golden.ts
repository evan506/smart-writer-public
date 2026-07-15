// Build golden scenarios from the author's real review decisions.
//
// The author's confirm/dismiss history on `entity_suggestions` IS a labeled
// dataset (Thinkly mines route-correction events; Smart Writer has a richer,
// directly-labeled signal). CONFIRMED names => the extractor should surface
// them; DISMISSED names => it should not. Relation suggestions are excluded
// (their "name" is "from → to", not an extractable noun).
//
// Limitation (documented): high-confidence auto-confirmed entities may not have
// a CONFIRMED suggestion row, so `shouldExtract` can undercount. The golden set
// only encodes decisions the author explicitly made — which is the point.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { GoldenScenario } from "./types";

export interface GoldenChapterInput {
  id: string;
  chapter_num: number;
  content: string | null;
}

export interface GoldenSuggestionInput {
  chapter_id: string | null;
  name: string;
  type: string;
  status: string;
}

function uniqueNonEmpty(names: string[]): string[] {
  return Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
}

/**
 * Pure transform: chapters + their suggestion decisions -> golden scenarios.
 * Only chapters with content AND at least one labeled name are included.
 */
export function buildGoldenScenarios(input: {
  projectId: string;
  chapters: GoldenChapterInput[];
  suggestions: GoldenSuggestionInput[];
}): GoldenScenario[] {
  const byChapter = new Map<
    string,
    { confirmed: string[]; dismissed: string[] }
  >();

  for (const suggestion of input.suggestions) {
    if (!suggestion.chapter_id) continue;
    if (suggestion.type === "RELATION") continue;

    const bucket =
      byChapter.get(suggestion.chapter_id) ?? { confirmed: [], dismissed: [] };
    if (suggestion.status === "CONFIRMED") bucket.confirmed.push(suggestion.name);
    else if (suggestion.status === "DISMISSED") bucket.dismissed.push(suggestion.name);
    byChapter.set(suggestion.chapter_id, bucket);
  }

  const scenarios: GoldenScenario[] = [];
  for (const chapter of input.chapters) {
    const content = chapter.content?.trim();
    if (!content) continue;

    const bucket = byChapter.get(chapter.id);
    if (!bucket) continue;

    const shouldExtract = uniqueNonEmpty(bucket.confirmed);
    const shouldNotExtract = uniqueNonEmpty(bucket.dismissed);
    if (shouldExtract.length === 0 && shouldNotExtract.length === 0) continue;

    scenarios.push({
      id: `${input.projectId}:ch${chapter.chapter_num}`,
      source: `project:${input.projectId} chapter:${chapter.chapter_num}`,
      chapterText: content,
      shouldExtract,
      shouldNotExtract,
    });
  }

  return scenarios;
}

type Db = SupabaseClient<Database>;

/** Load golden scenarios for one project from its chapters + suggestions. */
export async function loadGoldenFromProject(
  supabase: Db,
  projectId: string
): Promise<GoldenScenario[]> {
  const [{ data: chapters }, { data: suggestions }] = await Promise.all([
    supabase
      .from("chapters")
      .select("id, chapter_num, content")
      .eq("project_id", projectId),
    supabase
      .from("entity_suggestions")
      .select("chapter_id, name, type, status")
      .eq("project_id", projectId)
      .in("status", ["CONFIRMED", "DISMISSED"]),
  ]);

  return buildGoldenScenarios({
    projectId,
    chapters: chapters ?? [],
    suggestions: suggestions ?? [],
  });
}
