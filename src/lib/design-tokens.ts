import {
  RELATION_COLORS,
  RELATION_TYPE_LABELS,
} from "@/lib/relation-schema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SMART WRITER DESIGN SYSTEM v2 — Design Tokens
// Paper Light is the V1 app-wide baseline; Warm Dark is parked (see TODO Parking Lot); its palette lives in git history and docs/mockups.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── Paper Light Theme Tokens ───────────────────────────
// Keep these values aligned with docs/BRAND-GUIDE.md. Add unresolved decisions
// to docs/BRAND-GUIDE-CLEANUP-QUEUE.md instead of inventing local colors.

export const PAPER_THEME_TOKENS = {
  bgPage: "#f8f4ec",
  bgSurface: "#fbf7ee",
  bgElevated: "#fffaf1",
  bgOverlay: "#fffdf8",
  bgHover: "#f3ecdf",
  bgActive: "rgba(79, 140, 92, 0.1)",
  bgEditor: "#fffaf1",
  bgRaised: "#f3ecdf",
  textPrimary: "#2a2622",
  textSecondary: "#4f473d",
  textMuted: "#6b6358",
  textDim: "#9a9082",
  textGhost: "#b9ae9d",
  borderSubtle: "rgba(89, 68, 39, 0.08)",
  borderDefault: "#e8e0ce",
  borderHover: "#d9ceb9",
  borderFocus: "rgba(79, 140, 92, 0.32)",
  accent: "#4f8c5c",
  accentBg: "rgba(79, 140, 92, 0.1)",
  accentBorder: "rgba(79, 140, 92, 0.24)",
  cta: "#4f8c5c",
  ctaSoft: "rgba(79, 140, 92, 0.1)",
  success: "#4f8c5c",
  danger: "#a35a45",
  warning: "#b6862a",
  warnSoft: "rgba(182, 134, 42, 0.12)",
  info: "#6d7f63",
  link: "#4c6f8f",
  linkSoft: "rgba(76, 111, 143, 0.1)",
  linkBorder: "rgba(76, 111, 143, 0.26)",
} as const;


export const THEME_TOKENS = PAPER_THEME_TOKENS;

// ── Entity Type Configuration ──────────────────────────
// 코덱스 엔티티 타입별 color/bg/accent 3종 세트 + 아이콘/라벨

export type EntityTypeKey =
  | "CHARACTER"
  | "ORGANIZATION"
  | "PLACE"
  | "ITEM"
  | "CONCEPT"
  | "MAGIC_SYSTEM";

export interface EntityTypeConfig {
  color: string;
  bg: string;
  accent: string;
  icon: string;
  label: string;
}

export const ENTITY_TYPE_CONFIG: Record<EntityTypeKey, EntityTypeConfig> = {
  CHARACTER: {
    color: "#8badd9",
    bg: "rgba(139,173,217,0.08)",
    accent: "rgba(139,173,217,0.25)",
    icon: "👤",
    label: "인물",
  },
  ORGANIZATION: {
    color: "#c98db8",
    bg: "rgba(201,141,184,0.08)",
    accent: "rgba(201,141,184,0.25)",
    icon: "🏛",
    label: "조직",
  },
  PLACE: {
    color: "#7dd3a8",
    bg: "rgba(125,211,168,0.08)",
    accent: "rgba(125,211,168,0.25)",
    icon: "📍",
    label: "장소",
  },
  ITEM: {
    color: "#d4a86e",
    bg: "rgba(212,168,110,0.08)",
    accent: "rgba(212,168,110,0.25)",
    icon: "⚔️",
    label: "아이템",
  },
  CONCEPT: {
    color: "#a0aabe",
    bg: "rgba(160,170,190,0.08)",
    accent: "rgba(160,170,190,0.25)",
    icon: "💡",
    label: "개념",
  },
  MAGIC_SYSTEM: {
    color: "#c98db8",
    bg: "rgba(201,141,184,0.08)",
    accent: "rgba(201,141,184,0.25)",
    icon: "✨",
    label: "마법체계",
  },
};

export { RELATION_COLORS, RELATION_TYPE_LABELS };

// ── CTA & Accent Color Values ──────────────────────────
export const colors = {
  acc: PAPER_THEME_TOKENS.accent,
  accSoft: PAPER_THEME_TOKENS.accentBg,
  accMid: PAPER_THEME_TOKENS.accentBorder,
  cta: PAPER_THEME_TOKENS.cta,
  ctaSoft: PAPER_THEME_TOKENS.ctaSoft,
  danger: PAPER_THEME_TOKENS.danger,
  warn: PAPER_THEME_TOKENS.warning,
  warnSoft: PAPER_THEME_TOKENS.warnSoft,
} as const;

// ── Typography ─────────────────────────────────────────

export const font = {
  family:
    "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  mono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

// ── Animation ──────────────────────────────────────────

export const anim = {
  ease: "cubic-bezier(0.4, 0, 0.2, 1)",
  fast: "0.15s",
  normal: "0.25s",
  slow: "0.4s",
} as const;

// ── Glass Effect ───────────────────────────────────────

export const glass = {
  blur: "blur(16px)",
  blurLight: "blur(8px)",
  blurHeavy: "blur(24px)",
} as const;

// ── Shadows ────────────────────────────────────────────

export const shadow = {
  card: "0 12px 32px rgba(63, 45, 23, 0.08)",
  panel: "0 28px 80px rgba(50, 38, 22, 0.16)",
  glow: (color: string) => `0 0 20px ${color}15`,
} as const;

// ── App-wide primitive style helpers ───────────────────

export type CardState = "default" | "hover" | "active" | "selected" | "disabled";
export type StatusVariant = "neutral" | "accent" | "success" | "warn" | "destructive" | "preview";

export function getCardStyle(state: CardState = "default") {
  const base = {
    background: "var(--sw-bg-elevated)",
    border: "1px solid var(--sw-border-default)",
    color: "var(--sw-text-primary)",
  } as const;

  if (state === "active" || state === "selected") {
    return {
      ...base,
      background: "var(--sw-bg-active)",
      border: "1px solid var(--sw-accent-border)",
    };
  }

  if (state === "hover") {
    return {
      ...base,
      background: "var(--sw-bg-hover)",
      border: "1px solid var(--sw-border-hover)",
    };
  }

  if (state === "disabled") {
    return {
      ...base,
      opacity: 0.58,
    };
  }

  return base;
}

export function getPrimaryButtonStyle(disabled = false) {
  return {
    background: disabled ? "var(--sw-bg-raised)" : "var(--sw-cta)",
    border: `1px solid ${disabled ? "var(--sw-border-default)" : "var(--sw-cta)"}`,
    color: disabled ? "var(--sw-text-dim)" : "#fffaf1",
  } as const;
}

export function getGhostButtonStyle(active = false) {
  return {
    background: active ? "var(--sw-bg-active)" : "transparent",
    border: `1px solid ${active ? "var(--sw-accent-border)" : "var(--sw-border-default)"}`,
    color: active ? "var(--sw-accent)" : "var(--sw-text-muted)",
  } as const;
}

export function getStatusBadgeStyle(variant: StatusVariant = "neutral") {
  const styles: Record<StatusVariant, { background: string; border: string; color: string }> = {
    neutral: {
      background: "var(--sw-bg-raised)",
      border: "1px solid var(--sw-border-default)",
      color: "var(--sw-text-muted)",
    },
    accent: {
      background: "var(--sw-accent-bg)",
      border: "1px solid var(--sw-accent-border)",
      color: "var(--sw-accent)",
    },
    success: {
      background: "var(--sw-accent-bg)",
      border: "1px solid var(--sw-accent-border)",
      color: "var(--sw-success)",
    },
    warn: {
      background: "var(--sw-warn-soft)",
      border: "1px solid rgba(182, 134, 42, 0.28)",
      color: "var(--sw-warning)",
    },
    destructive: {
      background: "rgba(163, 90, 69, 0.1)",
      border: "1px solid rgba(163, 90, 69, 0.24)",
      color: "var(--sw-danger)",
    },
    preview: {
      background: "var(--sw-bg-raised)",
      border: "1px dashed var(--sw-border-hover)",
      color: "var(--sw-text-muted)",
    },
  };

  return styles[variant];
}

// ── Z-Index ────────────────────────────────────────────

export const zIndex = {
  base: 0,
  sidebar: 10,
  panel: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
} as const;

// ── Helper: get entity type config with fallback ───────

export function getEntityTypeConfig(
  type: string
): EntityTypeConfig {
  return (
    ENTITY_TYPE_CONFIG[type as EntityTypeKey] ?? {
      color: "#94a3b8",
      bg: "rgba(148,163,184,0.08)",
      accent: "rgba(148,163,184,0.25)",
      icon: "📄",
      label: type,
    }
  );
}

// ── Helper: staggered animation delay ──────────────────

export function staggerDelay(index: number, base = 0.03): string {
  return `${index * base}s`;
}
