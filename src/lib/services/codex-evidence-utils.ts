export type CodexEntityForEvidence = {
  id: string;
  name: string;
  aliases: unknown;
};

export type CodexRelationLinkForEvidence = {
  id: string;
  from_id: string;
  to_id: string;
  relation_type: string;
  direction: string;
};

export type CodexRelationSuggestionForEvidence = {
  id: string;
  chapter_id: string;
  name: string;
  aliases: unknown;
  context_snippet: string | null;
  updated_at: string | null;
};

export type CodexChapterForEvidence = {
  id: string;
  chapter_num: number;
};

export type CodexRelationEvidenceItem = {
  id: string;
  chapterId: string;
  chapterNum: number;
  name: string;
  relationType: string;
  contextSnippet: string | null;
  updatedAt: string | null;
};

export type CodexForeshadowForEvidence = {
  id: string;
  description: string | null;
  planted_chapter: number;
  expected_reveal: number | null;
  status: string | null;
  entity_ids: unknown;
};

export type CodexForeshadowEvidenceItem = {
  id: string;
  description: string | null;
  plantedChapter: number;
  expectedReveal: number | null;
  status: string | null;
};

// Deliberately trim+lower only (NOT src/lib/services/text-normalize.ts):
// codex evidence matching must keep inner spaces so "검은 서고" and
// "검은서고" stay distinct entities here.
export function normalizeCodexEntityName(name: string) {
  return name.trim().toLowerCase();
}

export function buildCodexNameToIdMap(entities: CodexEntityForEvidence[]) {
  const map = new Map<string, string>();
  for (const entity of entities) {
    map.set(normalizeCodexEntityName(entity.name), entity.id);
    if (!Array.isArray(entity.aliases)) continue;

    for (const alias of entity.aliases) {
      if (typeof alias === "string" && alias.trim()) {
        map.set(normalizeCodexEntityName(alias), entity.id);
      }
    }
  }
  return map;
}

export function assembleCodexRelationEvidence(input: {
  entities: CodexEntityForEvidence[];
  links: CodexRelationLinkForEvidence[];
  relationSuggestions: CodexRelationSuggestionForEvidence[];
  chapters: CodexChapterForEvidence[];
}) {
  const relationEvidence: Record<string, CodexRelationEvidenceItem[]> = {};
  const chapterMap = new Map(input.chapters.map((chapter) => [chapter.id, chapter.chapter_num]));
  const nameToId = buildCodexNameToIdMap(input.entities);
  const relationKeyToLinkId = new Map<string, string>();

  for (const link of input.links) {
    relationKeyToLinkId.set(
      `${link.from_id}|${link.to_id}|${link.relation_type}`,
      link.id
    );
    if (link.direction === "BI") {
      relationKeyToLinkId.set(
        `${link.to_id}|${link.from_id}|${link.relation_type}`,
        link.id
      );
    }
  }

  for (const suggestion of input.relationSuggestions) {
    const meta = suggestion.aliases as
      | {
          from_name?: string;
          to_name?: string;
          relation_type?: string;
        }
      | null;
    if (!meta?.from_name || !meta.to_name || !meta.relation_type) continue;

    const fromId = nameToId.get(normalizeCodexEntityName(meta.from_name));
    const toId = nameToId.get(normalizeCodexEntityName(meta.to_name));
    if (!fromId || !toId) continue;

    const linkId =
      relationKeyToLinkId.get(`${fromId}|${toId}|${meta.relation_type}`) ??
      relationKeyToLinkId.get(`${toId}|${fromId}|${meta.relation_type}`);
    if (!linkId) continue;

    const chapterNum = chapterMap.get(suggestion.chapter_id);
    if (chapterNum == null) continue;

    if (!relationEvidence[linkId]) relationEvidence[linkId] = [];
    relationEvidence[linkId].push({
      id: suggestion.id,
      chapterId: suggestion.chapter_id,
      chapterNum,
      name: suggestion.name,
      relationType: meta.relation_type,
      contextSnippet: suggestion.context_snippet,
      updatedAt: suggestion.updated_at,
    });
  }

  return relationEvidence;
}

export function assembleCodexForeshadowEvidence(
  foreshadows: CodexForeshadowForEvidence[],
  entityIds: string[]
) {
  const entityIdSet = new Set(entityIds);
  const entityForeshadows: Record<string, CodexForeshadowEvidenceItem[]> = {};

  for (const row of foreshadows) {
    const linkedIds = Array.isArray(row.entity_ids) ? row.entity_ids : [];
    for (const entityId of linkedIds) {
      if (typeof entityId !== "string" || !entityIdSet.has(entityId)) continue;
      if (!entityForeshadows[entityId]) entityForeshadows[entityId] = [];
      entityForeshadows[entityId].push({
        id: row.id,
        description: row.description,
        plantedChapter: row.planted_chapter,
        expectedReveal: row.expected_reveal,
        status: row.status,
      });
    }
  }

  return entityForeshadows;
}
