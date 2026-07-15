import { ENTITY_TYPE_CONFIG, getEntityTypeConfig } from "@/lib/design-tokens";
export { RELATION_TYPE_LABELS } from "@/lib/relation-schema";

export const CODEX_COLORS: Record<string, string> = {
  CHARACTER: ENTITY_TYPE_CONFIG.CHARACTER.color,
  PLACE: ENTITY_TYPE_CONFIG.PLACE.color,
  ORGANIZATION: ENTITY_TYPE_CONFIG.ORGANIZATION.color,
  ITEM: ENTITY_TYPE_CONFIG.ITEM.color,
  CONCEPT: ENTITY_TYPE_CONFIG.CONCEPT.color,
  MAGIC_SYSTEM: ENTITY_TYPE_CONFIG.MAGIC_SYSTEM.color,
};

export const TYPE_LABELS: Record<string, string> = {
  CHARACTER: "인물",
  PLACE: "장소",
  ORGANIZATION: "조직",
  ITEM: "아이템",
  CONCEPT: "개념",
  MAGIC_SYSTEM: "마법체계",
};

export function getColor(type: string) {
  return getEntityTypeConfig(type).color;
}
