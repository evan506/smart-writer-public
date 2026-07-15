import type { CodexFact } from "@/lib/services/canon-facts/read.service";

export interface EnrichedLink {
  id: string;
  relatedId: string;
  relatedName: string;
  relationType: string;
  direction: string;
  isFrom: boolean;
}

export interface EnrichedEntity {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  aliases: string[];
  links: EnrichedLink[];
  chapters: { chapterId: string; chapterNum: number }[];
  facts: CodexFact[];
}

export type CodexFieldValue = string | string[] | null;
