import type {
  Chapter,
  Chunk,
  Entity,
  EntityLink,
  EntitySuggestion,
  Foreshadow,
  Project,
} from "@/types";
import type { Database } from "@/types/database.types";

export type AnalysisJob = Database["public"]["Tables"]["analysis_jobs"]["Row"];

export type ReportChunkSource = Pick<
  Chunk,
  | "id"
  | "chapter_id"
  | "content"
  | "created_at"
  | "entity_tags"
  | "position"
  | "summary"
  | "type"
>;

export interface ReportEntityEvidenceSummary {
  evidence: ReportEvidence[];
  firstMentionChapterNum: number | null;
  mentionCount: number;
}

export interface ReportDataOptions {
  chapterFrom?: number;
  chapterTo?: number;
  evidenceLimitPerEntity?: number;
}

export interface ReportEntityRef {
  id: string;
  name: string;
  type: string;
}

export interface ReportChapter extends Chapter {
  charCount: number;
  excerpt: string;
}

export interface ReportEvidence {
  entityId: string;
  chapterId: string;
  chapterNum: number;
  chapterTitle: string | null;
  chunkId: string;
  chunkPosition: number | null;
  chunkType: string;
  mentionCount: number;
  snippet: string;
}

export interface ReportEntity extends Entity {
  firstMentionChapterNum: number | null;
  mentionCount: number;
  evidence: ReportEvidence[];
}

export interface ReportEntityLink extends EntityLink {
  from: ReportEntityRef | null;
  to: ReportEntityRef | null;
}

export interface ReportSuggestion extends EntitySuggestion {
  chapter: Pick<Chapter, "id" | "chapter_num" | "title"> | null;
  matchedEntity: ReportEntityRef | null;
}

export interface ReportForeshadow extends Foreshadow {
  entities: ReportEntityRef[];
}

export interface ReportAnalysisJob extends AnalysisJob {
  chapter: Pick<Chapter, "id" | "chapter_num" | "title"> | null;
}

export interface ReportStats {
  chapterCount: number;
  totalWordCount: number;
  totalCharCount: number;
  entityCount: number;
  entityCountsByType: Record<string, number>;
  suggestionCountsByStatus: Record<string, number>;
  foreshadowCountsByStatus: Record<string, number>;
  relationCount: number;
}

export interface ReportData {
  project: Project;
  range: {
    chapterFrom: number | null;
    chapterTo: number | null;
  };
  stats: ReportStats;
  chapters: ReportChapter[];
  entities: ReportEntity[];
  entityLinks: ReportEntityLink[];
  suggestions: ReportSuggestion[];
  foreshadows: ReportForeshadow[];
  analysisJobs: ReportAnalysisJob[];
}
