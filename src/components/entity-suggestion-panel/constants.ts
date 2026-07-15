import type { CSSProperties } from "react";
import { ENTITY_TYPE_CONFIG } from "@/lib/design-tokens";
import type { EntityType } from "@/types";

export const TYPE_LABELS: Record<string, string> = {
  CHARACTER: "인물",
  PLACE: "장소",
  ITEM: "아이템",
  ORGANIZATION: "조직",
  CONCEPT: "개념",
  MAGIC_SYSTEM: "마법체계",
  RELATION: "관계",
};

export const TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  CHARACTER: { bg: ENTITY_TYPE_CONFIG.CHARACTER.bg, text: ENTITY_TYPE_CONFIG.CHARACTER.color, border: ENTITY_TYPE_CONFIG.CHARACTER.accent },
  PLACE: { bg: ENTITY_TYPE_CONFIG.PLACE.bg, text: ENTITY_TYPE_CONFIG.PLACE.color, border: ENTITY_TYPE_CONFIG.PLACE.accent },
  ITEM: { bg: ENTITY_TYPE_CONFIG.ITEM.bg, text: ENTITY_TYPE_CONFIG.ITEM.color, border: ENTITY_TYPE_CONFIG.ITEM.accent },
  ORGANIZATION: { bg: ENTITY_TYPE_CONFIG.ORGANIZATION.bg, text: ENTITY_TYPE_CONFIG.ORGANIZATION.color, border: ENTITY_TYPE_CONFIG.ORGANIZATION.accent },
  CONCEPT: { bg: ENTITY_TYPE_CONFIG.CONCEPT.bg, text: ENTITY_TYPE_CONFIG.CONCEPT.color, border: ENTITY_TYPE_CONFIG.CONCEPT.accent },
  MAGIC_SYSTEM: { bg: ENTITY_TYPE_CONFIG.MAGIC_SYSTEM.bg, text: ENTITY_TYPE_CONFIG.MAGIC_SYSTEM.color, border: ENTITY_TYPE_CONFIG.MAGIC_SYSTEM.accent },
  RELATION: { bg: "var(--sw-warn-soft)", text: "var(--sw-warning)", border: "rgba(182, 134, 42, 0.28)" },
};

export const ENTITY_TYPES: { label: string; value: EntityType }[] = [
  { label: "캐릭터", value: "CHARACTER" },
  { label: "장소", value: "PLACE" },
  { label: "아이템", value: "ITEM" },
  { label: "조직", value: "ORGANIZATION" },
  { label: "개념", value: "CONCEPT" },
  { label: "마법체계", value: "MAGIC_SYSTEM" },
];

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "7px 10px",
  borderRadius: "6px",
  background: "var(--sw-bg-base)",
  border: "1px solid var(--sw-border-default)",
  color: "var(--sw-text-primary)",
  fontSize: "12px",
  outline: "none",
  fontFamily: "var(--sw-font-sans)",
  boxSizing: "border-box",
};

export const POLL_INTERVAL = 5000;
// Polling now ends on job DONE/FAILED (interim signals no longer stop it),
// so the ceiling only guards against a job that never terminates. Long
// chapters can legitimately run past 60s.
export const POLL_MAX_DURATION = 120000;
