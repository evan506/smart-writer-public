import type { EntityKind } from "@/components/codex-full-page/types";

export interface CodexEntity {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  aliases: unknown;
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

export interface CodexEvidence {
  id: string;
  chapterId: string;
  chapterNum: number;
  name: string;
  type: string;
  suggestedAction: string | null;
  contextSnippet: string | null;
  updatedAt: string | null;
}

export interface CodexRelationEvidence {
  id: string;
  chapterId: string;
  chapterNum: number;
  name: string;
  relationType: string;
  contextSnippet: string | null;
  updatedAt: string | null;
}

export interface CodexForeshadow {
  id: string;
  description: string | null;
  plantedChapter: number;
  expectedReveal: number | null;
  status: string | null;
}

export interface CodexFactSource {
  id: string;
  chapterId: string | null;
  chapterNum: number | null;
  chapterTitle: string | null;
  chunkId: string | null;
  evidenceText: string | null;
  evidenceKind: string;
}

export interface CodexFact {
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
  sources: CodexFactSource[];
}

export interface CodexDetailPanelProps {
  entity: CodexEntity;
  /**
   * Whether `entity.id` is an `entities` row or a pending `entity_suggestions` row.
   * The management actions below (edit / delete / merge-as-alias / remove-alias) all
   * resolve the id against `entities`, so they only apply to "entity". Candidates are
   * reviewed in the write workspace's 확인 panel — see docs/demo-guide.md §4-6.
   */
  kind: EntityKind;
  entityLinks: CodexLink[];
  relationEvidence: Record<string, CodexRelationEvidence[]>;
  allEntities: CodexEntity[];
  chapters: { chapterId: string; chapterNum: number }[];
  evidence: CodexEvidence[];
  foreshadows: CodexForeshadow[];
  facts: CodexFact[];
  status: "confirmed" | "review" | "warning";
  firstChapter: number | null;
  projectId: string;
  onClose: () => void;
  onEntityClick: (entityId: string) => void;
  onDeleted: () => void;
}

export interface RelationItem {
  linkId: string;
  id: string;
  name: string;
  type: string;
  relationType: string;
  weight: number;
  evidence: CodexRelationEvidence[];
}
