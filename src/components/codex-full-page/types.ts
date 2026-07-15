export interface CodexEntity {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  aliases: unknown;
  metadata?: unknown;
}

export interface PendingEntity {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  aliases: unknown;
  chapterNum: number | null;
  confidence: number;
}

export interface CodexLink {
  id: string;
  from_id: string;
  to_id: string;
  from_name: string;
  to_name: string;
  relation_type: string;
  direction: string;
  weight: number;
}

export type EntityChapters = Record<string, { chapterId: string; chapterNum: number }[]>;
export type RelationEvidence = Record<
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
>;
export type EntityEvidence = Record<
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
>;
export type EntityForeshadows = Record<
  string,
  {
    id: string;
    description: string | null;
    plantedChapter: number;
    expectedReveal: number | null;
    status: string | null;
  }[]
>;
export type EntityFacts = Record<
  string,
  {
    id: string;
    entityId: string;
    factType: string;
    factKey: string | null;
    value: string;
    status: string;
    confidence: number;
    establishedChapterId: string | null;
    establishedChapterNum: number | null;
    approvedAt: string | null;
    sources: {
      id: string;
      chapterId: string | null;
      chapterNum: number | null;
      chapterTitle: string | null;
      chunkId: string | null;
      evidenceText: string | null;
      evidenceKind: string;
    }[];
  }[]
>;
export type SortOption = "relations" | "recent" | "name" | "chapter";

export interface EnrichedEntity extends CodexEntity {
  aliasArray: string[];
  relationCount: number;
  firstChapter: number | null;
  status: "confirmed" | "review" | "warning";
  pendingCount: number;
  isDuplicate: boolean;
  /**
   * Which table `id` points at. The codex list deliberately mixes saved entities with
   * still-pending extraction candidates so the author can see what is waiting on them,
   * but a candidate's `id` is an `entity_suggestions` row — passing it to an entity
   * server action looks up `entities` and finds nothing.
   *
   * Required, not optional: `status` cannot stand in for it. A *saved* entity also
   * reads "review" when candidates are matched to it (see codex-full-page.tsx), so
   * branching on status would misroute real entities.
   */
  kind: EntityKind;
}

export type EntityKind = "entity" | "suggestion";

export interface CodexFullPageProps {
  projectId: string;
  projectTitle: string;
  entities: CodexEntity[];
  links: CodexLink[];
  relationEvidence: RelationEvidence;
  entityChapters: EntityChapters;
  entityEvidence: EntityEvidence;
  entityForeshadows: EntityForeshadows;
  entityFacts: EntityFacts;
  pendingEntities: PendingEntity[];
  pendingSuggestions: Record<string, number>;
  unmatchedSuggestionCount: number;
  totalChapters: number;
}
