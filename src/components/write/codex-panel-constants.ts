import { ENTITY_TYPE_CONFIG } from "@/lib/design-tokens";
import type { EntityType } from "@/types";

export const ENTITY_TYPES: { label: string; value: EntityType }[] = [
  { label: "캐릭터", value: "CHARACTER" },
  { label: "장소", value: "PLACE" },
  { label: "아이템", value: "ITEM" },
  { label: "조직", value: "ORGANIZATION" },
  { label: "개념", value: "CONCEPT" },
  { label: "마법체계", value: "MAGIC_SYSTEM" },
];

export const TYPE_COLORS: Record<string, { color: string; bg: string }> = {
  CHARACTER: ENTITY_TYPE_CONFIG.CHARACTER,
  PLACE: ENTITY_TYPE_CONFIG.PLACE,
  ORGANIZATION: ENTITY_TYPE_CONFIG.ORGANIZATION,
  CONCEPT: ENTITY_TYPE_CONFIG.CONCEPT,
  ITEM: ENTITY_TYPE_CONFIG.ITEM,
  MAGIC_SYSTEM: ENTITY_TYPE_CONFIG.MAGIC_SYSTEM,
};

export const TYPE_LABELS: Record<string, string> = {
  CHARACTER: "인물",
  PLACE: "장소",
  ITEM: "아이템",
  ORGANIZATION: "조직",
  CONCEPT: "개념",
  MAGIC_SYSTEM: "마법",
};

export function getTypeColor(type: string) {
  return (
    TYPE_COLORS[type] ?? {
      color: "var(--sw-text-secondary)",
      bg: "var(--sw-bg-raised)",
    }
  );
}

export const ENTITY_TYPE_KEYS = Object.keys(ENTITY_TYPE_CONFIG);
