import type {
  Chapter,
  Entity,
  EntityLink,
  EntitySuggestion,
  Foreshadow,
  Mention,
} from "@/types";
import { buildSnippet, countBy, normalizeWhitespace } from "./utils";
import type {
  AnalysisJob,
  ReportAnalysisJob,
  ReportChapter,
  ReportChunkSource,
  ReportEntity,
  ReportEntityEvidenceSummary,
  ReportEntityLink,
  ReportEntityRef,
  ReportEvidence,
  ReportForeshadow,
  ReportStats,
  ReportSuggestion,
} from "./types";

export function buildEvidenceByEntity(
  mentions: Mention[],
  chunkMap: Map<string, ReportChunkSource>,
  chapterMap: Map<string, Chapter>,
  limit: number
): Map<string, ReportEntityEvidenceSummary> {
  const result = new Map<string, ReportEvidence[]>();

  for (const mention of mentions) {
    const chunk = chunkMap.get(mention.chunk_id);
    if (!chunk) continue;

    const chapter = chapterMap.get(chunk.chapter_id);
    if (!chapter) continue;

    const list = result.get(mention.entity_id) ?? [];
    list.push({
      entityId: mention.entity_id,
      chapterId: chapter.id,
      chapterNum: chapter.chapter_num,
      chapterTitle: chapter.title,
      chunkId: chunk.id,
      chunkPosition: chunk.position,
      chunkType: chunk.type,
      mentionCount: mention.count ?? 0,
      snippet: buildSnippet(chunk),
    });
    result.set(mention.entity_id, list);
  }

  const summaries = new Map<string, ReportEntityEvidenceSummary>();

  for (const [entityId, evidence] of result) {
    evidence.sort((a, b) => {
      if (a.chapterNum !== b.chapterNum) return a.chapterNum - b.chapterNum;
      return (a.chunkPosition ?? 0) - (b.chunkPosition ?? 0);
    });
    summaries.set(entityId, {
      evidence: evidence.slice(0, limit),
      firstMentionChapterNum: evidence[0]?.chapterNum ?? null,
      mentionCount: evidence.reduce((sum, item) => sum + item.mentionCount, 0),
    });
  }

  return summaries;
}

export function toReportChapter(chapter: Chapter): ReportChapter {
  const content = chapter.content ?? "";
  return {
    ...chapter,
    charCount: content.length,
    excerpt: normalizeWhitespace(content).slice(0, 500),
  };
}

export function toReportEntity(
  entity: Entity,
  summary: ReportEntityEvidenceSummary | undefined
): ReportEntity {
  return {
    ...entity,
    firstMentionChapterNum: summary?.firstMentionChapterNum ?? null,
    mentionCount: summary?.mentionCount ?? 0,
    evidence: summary?.evidence ?? [],
  };
}

export function toReportEntityLink(
  link: EntityLink,
  entityMap: Map<string, Entity>
): ReportEntityLink {
  return {
    ...link,
    from: toEntityRef(entityMap.get(link.from_id)),
    to: toEntityRef(entityMap.get(link.to_id)),
  };
}

export function toReportSuggestion(
  suggestion: EntitySuggestion,
  chapterMap: Map<string, Chapter>,
  entityMap: Map<string, Entity>
): ReportSuggestion {
  const chapter = chapterMap.get(suggestion.chapter_id);
  return {
    ...suggestion,
    chapter: chapter
      ? {
          id: chapter.id,
          chapter_num: chapter.chapter_num,
          title: chapter.title,
        }
      : null,
    matchedEntity: toEntityRef(
      suggestion.matched_entity_id
        ? entityMap.get(suggestion.matched_entity_id)
        : undefined
    ),
  };
}

export function toReportForeshadow(
  foreshadow: Foreshadow,
  entityMap: Map<string, Entity>
): ReportForeshadow {
  return {
    ...foreshadow,
    entities: (foreshadow.entity_ids ?? [])
      .map((entityId) => toEntityRef(entityMap.get(entityId)))
      .filter((entity): entity is ReportEntityRef => entity !== null),
  };
}

export function toReportAnalysisJob(
  job: AnalysisJob,
  chapterMap: Map<string, Chapter>
): ReportAnalysisJob {
  const chapter = chapterMap.get(job.chapter_id);
  return {
    ...job,
    chapter: chapter
      ? {
          id: chapter.id,
          chapter_num: chapter.chapter_num,
          title: chapter.title,
        }
      : null,
  };
}

export function buildStats(
  chapters: ReportChapter[],
  entities: ReportEntity[],
  suggestions: EntitySuggestion[],
  foreshadows: Foreshadow[],
  entityLinks: EntityLink[]
): ReportStats {
  return {
    chapterCount: chapters.length,
    totalWordCount: chapters.reduce(
      (sum, chapter) => sum + (chapter.word_count ?? 0),
      0
    ),
    totalCharCount: chapters.reduce(
      (sum, chapter) => sum + chapter.charCount,
      0
    ),
    entityCount: entities.length,
    entityCountsByType: countBy(entities, (entity) => entity.type),
    suggestionCountsByStatus: countBy(
      suggestions,
      (suggestion) => suggestion.status
    ),
    foreshadowCountsByStatus: countBy(
      foreshadows,
      (foreshadow) => foreshadow.status ?? "UNKNOWN"
    ),
    relationCount: entityLinks.length,
  };
}

function toEntityRef(entity: Entity | undefined): ReportEntityRef | null {
  if (!entity) return null;
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
  };
}
