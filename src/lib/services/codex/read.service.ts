import type { createClient } from "@/lib/supabase/server";
import {
  assembleCodexForeshadowEvidence,
  assembleCodexRelationEvidence,
} from "@/lib/services/codex-evidence-utils";
import {
  listApprovedCodexFactsByEntity,
  type CodexFact,
} from "@/lib/services/canon-facts/read.service";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export function emptyCodexData(error: string) {
  return {
    error,
    entities: [] as { id: string; name: string; type: string; summary: string | null; aliases: unknown; metadata: unknown }[],
    pendingEntities: [] as { id: string; name: string; type: string; summary: string | null; aliases: unknown; chapterNum: number | null; confidence: number }[],
    links: [] as {
      id: string;
      from_id: string;
      to_id: string;
      from_name: string;
      to_name: string;
      relation_type: string;
      direction: string;
      weight: number;
    }[],
    relationEvidence: {} as Record<
      string,
      {
        id: string;
        chapterId: string;
        chapterNum: number;
        name: string;
        relationType: string;
        contextSnippet: string | null;
        updatedAt: string | null;
      }[]
    >,
    entityChapters: {} as Record<
      string,
      { chapterId: string; chapterNum: number }[]
    >,
    entityEvidence: {} as Record<
      string,
      {
        id: string;
        chapterId: string;
        chapterNum: number;
        name: string;
        type: string;
        suggestedAction: string | null;
        contextSnippet: string | null;
        updatedAt: string | null;
      }[]
    >,
    entityForeshadows: {} as Record<
      string,
      {
        id: string;
        description: string | null;
        plantedChapter: number;
        expectedReveal: number | null;
        status: string | null;
      }[]
    >,
    entityFacts: {} as Record<string, CodexFact[]>,
    pendingSuggestions: {} as Record<string, number>,
    unmatchedSuggestionCount: 0,
    totalChapters: 0,
  };
}

function buildNameToIdsMap(entities: { id: string; name: string }[]) {
  const map = new Map<string, string[]>();
  for (const e of entities) {
    const key = e.name.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e.id);
  }
  return map;
}

export async function getCodexDataForProject(
  supabase: SupabaseClient,
  projectId: string
) {
  const { data: entities, error: entError } = await supabase
    .from("entities")
    .select("id, name, type, summary, aliases, metadata")
    .eq("project_id", projectId)
    .order("type")
    .order("name");

  if (entError || !entities) {
    return emptyCodexData(entError?.message ?? "조회 실패");
  }

  const entityIds = entities.map((e) => e.id);

  let links: {
    id: string;
    from_id: string;
    to_id: string;
    from_name: string;
    to_name: string;
    relation_type: string;
    direction: string;
    weight: number;
  }[] = [];
  const relationEvidence: Record<
    string,
    {
      id: string;
      chapterId: string;
      chapterNum: number;
      name: string;
      relationType: string;
      contextSnippet: string | null;
      updatedAt: string | null;
    }[]
  > = {};

  if (entityIds.length > 0) {
    const { data: rawLinks } = await supabase
      .from("entity_links")
      .select("id, from_id, to_id, relation_type, direction, weight")
      .or(
        `from_id.in.(${entityIds.join(",")}),to_id.in.(${entityIds.join(",")})`
      );

    if (rawLinks) {
      const nameMap = new Map(entities.map((e) => [e.id, e.name]));
      links = rawLinks.map((l) => ({
        id: l.id,
        from_id: l.from_id,
        to_id: l.to_id,
        from_name: nameMap.get(l.from_id) ?? "?",
        to_name: nameMap.get(l.to_id) ?? "?",
        relation_type: l.relation_type,
        direction: l.direction ?? "UNI",
        weight: l.weight ?? 0.5,
      }));
    }
  }

  const entityChapters: Record<
    string,
    { chapterId: string; chapterNum: number }[]
  > = {};
  const entityEvidence: Record<
    string,
    {
      id: string;
      chapterId: string;
      chapterNum: number;
      name: string;
      type: string;
      suggestedAction: string | null;
      contextSnippet: string | null;
      updatedAt: string | null;
    }[]
  > = {};
  const entityForeshadows: Record<
    string,
    {
      id: string;
      description: string | null;
      plantedChapter: number;
      expectedReveal: number | null;
      status: string | null;
    }[]
  > = {};
  let entityFacts: Record<string, CodexFact[]> = {};

  if (entityIds.length > 0) {
    const [{ data: suggestions }, { data: chapters }] = await Promise.all([
      supabase
        .from("entity_suggestions")
        .select("id, matched_entity_id, chapter_id, name, type, suggested_action, context_snippet, updated_at")
        .eq("project_id", projectId)
        .eq("status", "CONFIRMED")
        .not("matched_entity_id", "is", null),
      supabase
        .from("chapters")
        .select("id, chapter_num")
        .eq("project_id", projectId),
    ]);

    if (suggestions && chapters) {
      const chapterMap = new Map(
        chapters.map((c) => [c.id, c.chapter_num])
      );
      for (const s of suggestions) {
        if (!s.matched_entity_id) continue;
        const chapterNum = chapterMap.get(s.chapter_id);
        if (chapterNum == null) continue;
        if (!entityChapters[s.matched_entity_id]) {
          entityChapters[s.matched_entity_id] = [];
        }
        const already = entityChapters[s.matched_entity_id].some(
          (x) => x.chapterId === s.chapter_id
        );
        if (!already) {
          entityChapters[s.matched_entity_id].push({
            chapterId: s.chapter_id,
            chapterNum,
          });
        }
        if (!entityEvidence[s.matched_entity_id]) {
          entityEvidence[s.matched_entity_id] = [];
        }
        entityEvidence[s.matched_entity_id].push({
          id: s.id,
          chapterId: s.chapter_id,
          chapterNum,
          name: s.name,
          type: s.type,
          suggestedAction: s.suggested_action,
          contextSnippet: s.context_snippet,
          updatedAt: s.updated_at,
        });
      }
    }
  }

  if (entityIds.length > 0 && links.length > 0) {
    const [{ data: relationSuggestions }, { data: chapters }] = await Promise.all([
      supabase
        .from("entity_suggestions")
        .select("id, chapter_id, name, summary, aliases, context_snippet, updated_at")
        .eq("project_id", projectId)
        .eq("status", "CONFIRMED")
        .eq("type", "RELATION"),
      supabase
        .from("chapters")
        .select("id, chapter_num")
        .eq("project_id", projectId),
    ]);

    Object.assign(
      relationEvidence,
      assembleCodexRelationEvidence({
        entities,
        links,
        relationSuggestions: relationSuggestions ?? [],
        chapters: chapters ?? [],
      })
    );
  }

  if (entityIds.length > 0) {
    entityFacts = await listApprovedCodexFactsByEntity(
      supabase,
      projectId,
      entityIds
    );
  }

  if (entityIds.length > 0) {
    const { data: foreshadows } = await supabase
      .from("foreshadows")
      .select("id, description, planted_chapter, expected_reveal, status, entity_ids")
      .eq("project_id", projectId)
      .order("planted_chapter");

    Object.assign(
      entityForeshadows,
      assembleCodexForeshadowEvidence(foreshadows ?? [], entityIds)
    );
  }

  const pendingSuggestions: Record<string, number> = {};
  let unmatchedSuggestionCount = 0;

  {
    const { data: pendingRows } = await supabase
      .from("entity_suggestions")
      .select("name, matched_entity_id")
      .eq("project_id", projectId)
      .eq("status", "PENDING")
      .neq("type", "RELATION");

    if (pendingRows && pendingRows.length > 0) {
      const nameToIds = buildNameToIdsMap(entities);

      for (const row of pendingRows) {
        let matched = false;
        if (row.matched_entity_id) {
          pendingSuggestions[row.matched_entity_id] =
            (pendingSuggestions[row.matched_entity_id] ?? 0) + 1;
          matched = true;
        }
        if (!matched && row.name) {
          const matchedIds = nameToIds.get(row.name.toLowerCase());
          if (matchedIds) {
            for (const id of matchedIds) {
              pendingSuggestions[id] =
                (pendingSuggestions[id] ?? 0) + 1;
            }
            matched = true;
          }
        }
        if (!matched) {
          unmatchedSuggestionCount++;
        }
      }
    }
  }

  const { data: pendingSugRows } = await supabase
    .from("entity_suggestions")
    .select("id, name, type, summary, aliases, confidence, chapter_id")
    .eq("project_id", projectId)
    .eq("status", "PENDING")
    .neq("type", "RELATION")
    .order("confidence", { ascending: false });

  const allChapters = await supabase
    .from("chapters")
    .select("id, chapter_num")
    .eq("project_id", projectId);

  const chapterNumMap = new Map<string, number>();
  if (allChapters.data) {
    for (const ch of allChapters.data) {
      chapterNumMap.set(ch.id, ch.chapter_num);
    }
  }

  const pendingEntities = (pendingSugRows ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    type: s.type,
    summary: s.summary,
    aliases: s.aliases,
    chapterNum: chapterNumMap.get(s.chapter_id) ?? null,
    confidence: s.confidence,
  }));

  const totalChapters = allChapters.data?.length ?? 0;

  return {
    error: null,
    entities,
    pendingEntities,
    links,
    relationEvidence,
    entityChapters,
    entityEvidence,
    entityForeshadows,
    entityFacts,
    pendingSuggestions,
    unmatchedSuggestionCount,
    totalChapters,
  };
}
