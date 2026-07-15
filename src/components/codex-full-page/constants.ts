import { ENTITY_TYPE_CONFIG, getEntityTypeConfig } from "@/lib/design-tokens";

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

export const TYPE_GROUPS = [
  { key: "CHARACTER", types: ["CHARACTER"], label: "인물", color: ENTITY_TYPE_CONFIG.CHARACTER.color },
  { key: "PLACE", types: ["PLACE"], label: "장소", color: ENTITY_TYPE_CONFIG.PLACE.color },
  { key: "ORGANIZATION", types: ["ORGANIZATION"], label: "조직", color: ENTITY_TYPE_CONFIG.ORGANIZATION.color },
  { key: "ITEM", types: ["ITEM"], label: "아이템", color: ENTITY_TYPE_CONFIG.ITEM.color },
  {
    key: "OTHER",
    types: ["CONCEPT", "MAGIC_SYSTEM"],
    label: "개념·마법",
    color: ENTITY_TYPE_CONFIG.CONCEPT.color,
  },
] as const;

export function getColor(type: string) {
  return getEntityTypeConfig(type).color;
}
