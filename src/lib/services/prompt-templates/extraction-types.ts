import type { CanonFactType, EntityType } from "@/types";

export interface ExtractedFact {
  fact_type: CanonFactType;
  fact_key?: string;
  value: string;
  evidence: string;
  confidence?: number;
}

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  sub_type?: string;
  alias_of?: string;
  summary: string;
  aliases: string[];
  confidence: number;
  context_snippet: string;
  facts?: ExtractedFact[];
}

export interface ExtractedRelation {
  from_name: string;
  to_name: string;
  relation_type: string;
  direction: "UNI" | "BI";
  weight: number;
  context_snippet: string;
  conflict_note?: string;
}

export interface KnownEntity {
  id?: string;
  name: string;
  type: string;
  aliases?: string[];
}

const ENTITY_TYPE_MAP: Record<string, EntityType> = {
  캐릭터: "CHARACTER",
  인물: "CHARACTER",
  CHARACTER: "CHARACTER",
  장소: "PLACE",
  지역: "PLACE",
  PLACE: "PLACE",
  아이템: "ITEM",
  물건: "ITEM",
  무기: "ITEM",
  ITEM: "ITEM",
  조직: "ORGANIZATION",
  단체: "ORGANIZATION",
  세력: "ORGANIZATION",
  길드: "ORGANIZATION",
  ORGANIZATION: "ORGANIZATION",
  개념: "CONCEPT",
  스킬: "CONCEPT",
  능력: "CONCEPT",
  CONCEPT: "CONCEPT",
  마법체계: "MAGIC_SYSTEM",
  마법: "MAGIC_SYSTEM",
  MAGIC_SYSTEM: "MAGIC_SYSTEM",
};

export function normalizeEntityType(raw: string): EntityType | null {
  return ENTITY_TYPE_MAP[raw] ?? null;
}
