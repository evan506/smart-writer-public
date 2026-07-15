import type { Database } from "./database.types";

// ── Row types (읽기용) ──
export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type Entity = Database["public"]["Tables"]["entities"]["Row"];
export type EntityLink = Database["public"]["Tables"]["entity_links"]["Row"];
export type Chapter = Database["public"]["Tables"]["chapters"]["Row"];
export type Chunk = Database["public"]["Tables"]["chunks"]["Row"];
export type Mention = Database["public"]["Tables"]["mentions"]["Row"];
export type Foreshadow = Database["public"]["Tables"]["foreshadows"]["Row"];
export type GenreKit = Database["public"]["Tables"]["genre_kits"]["Row"];
export type RagLog = Database["public"]["Tables"]["rag_logs"]["Row"];
export type LLMUsageLog = Database["public"]["Tables"]["llm_usage_logs"]["Row"];
export type CanonFact = Database["public"]["Tables"]["canon_facts"]["Row"];
export type CanonFactSource =
  Database["public"]["Tables"]["canon_fact_sources"]["Row"];
export type FactSuggestion =
  Database["public"]["Tables"]["fact_suggestions"]["Row"];
export type EntitySuggestion =
  Database["public"]["Tables"]["entity_suggestions"]["Row"];
export type PlanningBlock =
  Database["public"]["Tables"]["planning_blocks"]["Row"];
export type PlanningLink =
  Database["public"]["Tables"]["planning_links"]["Row"];
export type PlotThread =
  Database["public"]["Tables"]["plot_threads"]["Row"];
export type PlotThreadPlanningBlock =
  Database["public"]["Tables"]["plot_thread_planning_blocks"]["Row"];
export type PlotThreadChapter =
  Database["public"]["Tables"]["plot_thread_chapters"]["Row"];

// ── EntitySuggestion Insert/Update types ──
export type EntitySuggestionInsert =
  Database["public"]["Tables"]["entity_suggestions"]["Insert"];
export type EntitySuggestionUpdate =
  Database["public"]["Tables"]["entity_suggestions"]["Update"];
export type FactSuggestionInsert =
  Database["public"]["Tables"]["fact_suggestions"]["Insert"];
export type FactSuggestionUpdate =
  Database["public"]["Tables"]["fact_suggestions"]["Update"];
export type PlanningBlockInsert =
  Database["public"]["Tables"]["planning_blocks"]["Insert"];
export type PlanningBlockUpdate =
  Database["public"]["Tables"]["planning_blocks"]["Update"];
export type PlanningLinkInsert =
  Database["public"]["Tables"]["planning_links"]["Insert"];

// ── Insert types ──
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
export type EntityInsert = Database["public"]["Tables"]["entities"]["Insert"];
export type ChapterInsert = Database["public"]["Tables"]["chapters"]["Insert"];
export type EntityLinkInsert = Database["public"]["Tables"]["entity_links"]["Insert"];
export type GenreKitInsert = Database["public"]["Tables"]["genre_kits"]["Insert"];

// ── Update types ──
export type EntityUpdate = Database["public"]["Tables"]["entities"]["Update"];
export type ChapterUpdate = Database["public"]["Tables"]["chapters"]["Update"];
export type ForeshadowInsert = Database["public"]["Tables"]["foreshadows"]["Insert"];
export type ForeshadowUpdate = Database["public"]["Tables"]["foreshadows"]["Update"];
export type GenreKitUpdate = Database["public"]["Tables"]["genre_kits"]["Update"];

// ── Genre Kit rule structure ──
export interface GenreRule {
  category: string;
  rule: string;
}

// ── Additional Insert types ──
export type ChunkInsert = Database["public"]["Tables"]["chunks"]["Insert"];
export type MentionInsert = Database["public"]["Tables"]["mentions"]["Insert"];
export type RagLogInsert = Database["public"]["Tables"]["rag_logs"]["Insert"];
export type LLMUsageLogInsert =
  Database["public"]["Tables"]["llm_usage_logs"]["Insert"];
export type CanonFactInsert =
  Database["public"]["Tables"]["canon_facts"]["Insert"];
export type CanonFactSourceInsert =
  Database["public"]["Tables"]["canon_fact_sources"]["Insert"];

// ── Enum-like types (DB CHECK constraints 기반) ──
export type EntityType =
  | "CHARACTER"
  | "PLACE"
  | "ITEM"
  | "ORGANIZATION"
  | "CONCEPT"
  | "MAGIC_SYSTEM";

export type ChunkType = "CHAPTER" | "SCENE" | "DIALOGUE";

export type ForeshadowStatus = "PLANTED" | "REVEALED" | "ABANDONED";

export type LinkDirection = "UNI" | "BI";

export type SuggestionType = EntityType | "RELATION";

export type SuggestionStatus = "PENDING" | "CONFIRMED" | "DISMISSED";

export type CanonFactType =
  | "ATTRIBUTE"
  | "ROLE"
  | "AFFILIATION"
  | "ABILITY"
  | "STATE"
  | "LOCATION_INFO"
  | "RULE"
  | "DESCRIPTION_TEXT";

export type CanonFactStatus =
  | "PENDING"
  | "APPROVED"
  | "SUPERSEDED"
  | "DISMISSED";

export type FactSuggestionStatus =
  | "PENDING"
  | "APPROVED"
  | "DISMISSED"
  | "MERGED";

export type CanonFactEvidenceKind =
  | "DIRECT"
  | "INFERRED"
  | "DIALOGUE"
  | "NARRATION"
  | "AUTHOR_NOTE";

export type PlanningBlockKind =
  | "ROOT"
  | "EPISODE"
  | "CHAPTER"
  | "SCENE"
  | "EVENT"
  | "PROMISE"
  | "CHARACTER_PLAN"
  | "PLACE_PLAN";

export type PlanningBlockStatus =
  | "PLANNED"
  | "EXPANDED"
  | "NEEDS_DETAIL"
  | "MANUSCRIPT_SEEN"
  | "MEMORY_LINKED"
  | "NEEDS_REVIEW";

export type PlanningStructureKey =
  | "START"
  | "DEVELOPMENT"
  | "TURN"
  | "ENDING";

export type PlanningLinkTargetType =
  | "chapter"
  | "entity"
  | "canon_fact"
  | "entity_suggestion"
  | "fact_suggestion";

export type PlanningLinkKind =
  | "PLANNED_FOR"
  | "MENTIONED_IN"
  | "MEMORY_LINKED"
  | "PROMISE_SEEDED"
  | "PROMISE_RESOLVED"
  | "NEEDS_REVIEW";

// ── RPC 반환 타입 ──
export type FindRelatedEntitiesResult =
  Database["public"]["Functions"]["find_related_entities"]["Returns"][number];

export type CheckRelationshipResult =
  Database["public"]["Functions"]["check_relationship"]["Returns"][number];

export type GetEntityContextResult =
  Database["public"]["Functions"]["get_entity_context"]["Returns"][number];

export type MatchChunksResult =
  Database["public"]["Functions"]["match_chunks"]["Returns"][number];

export type SearchEntitiesBm25Result =
  Database["public"]["Functions"]["search_entities_bm25"]["Returns"][number];

export type SearchChaptersBm25Result =
  Database["public"]["Functions"]["search_chapters_bm25"]["Returns"][number];

export type DetectConflictsResult =
  Database["public"]["Functions"]["detect_conflicts"]["Returns"][number];

// ── Query Router 타입 ──
export type RAGMode = "graph" | "vector" | "bm25" | "hybrid";

export interface QueryClassification {
  mode: RAGMode;
  confidence: number;
  reasoning: string;
}

// ── AI 분석 타입 ──
export type {
  AIConflict,
  AISuggestion,
  AIReference,
  AIAnalysisResult,
} from "./ai-analysis";

// ── 인라인 경고 타입 ──
export type { InlineWarning } from "./inline-warning";
