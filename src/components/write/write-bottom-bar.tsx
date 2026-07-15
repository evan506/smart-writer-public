"use client";

import { Loader2, Save } from "lucide-react";
import type { SaveStatus } from "@/hooks/use-autosave";
import { ConsistencyCheckButton } from "./consistency-check-button";

export type PlatformMode = "default" | "novelpia" | "munpia";

const PLATFORMS: { id: PlatformMode; label: string }[] = [
  { id: "default", label: "기본" },
  { id: "novelpia", label: "노벨피아" },
  { id: "munpia", label: "문피아" },
];

function countChars(
  content: string,
  mode: PlatformMode
): { withSpaces: number; withoutSpaces: number; platformCount: number } {
  const withSpaces = content.length;
  const withoutSpaces = content.replace(/\s/g, "").length;

  let platformCount: number;
  switch (mode) {
    case "novelpia":
      platformCount = content.replace(/[\s.,!?;:'"()「」『』—…·]/g, "").length;
      break;
    case "munpia":
      platformCount = withoutSpaces;
      break;
    default:
      platformCount = withoutSpaces;
  }

  return { withSpaces, withoutSpaces, platformCount };
}

interface WriteBottomBarProps {
  content: string;
  platformMode: PlatformMode;
  onPlatformModeChange: (mode: PlatformMode) => void;
  saveStatus: SaveStatus;
  aiAnalyzing?: boolean;
  onSave: () => void;
  chapterId?: string | null;
}

export function WriteBottomBar({
  content,
  platformMode,
  onPlatformModeChange,
  saveStatus,
  aiAnalyzing = false,
  onSave,
  chapterId = null,
}: WriteBottomBarProps) {
  const { withSpaces, withoutSpaces } = countChars(content, platformMode);

  return (
    <div
      className="flex h-8 shrink-0 items-center justify-between px-4 text-[11px]"
      style={{
        background: "var(--sw-bg-surface)",
        borderTop: "1px solid var(--sw-border-default)",
      }}
    >
      {/* Left: char counts */}
      <div
        className="flex flex-1 items-center gap-4"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <span>
          <span className="font-medium" style={{ color: "var(--sw-text-secondary)" }}>
            {withSpaces.toLocaleString()}
          </span>
          <span style={{ color: "var(--sw-text-muted)" }}>자</span>
        </span>
        <span style={{ color: "var(--sw-text-muted)" }}>
          공백제외{" "}
          <span className="font-medium" style={{ color: "var(--sw-text-secondary)" }}>
            {withoutSpaces.toLocaleString()}
          </span>
          자
        </span>
        {/* Save status indicator (inline) */}
        {saveStatus === "saving" && (
          <span className="flex items-center gap-1" style={{ color: "var(--sw-text-muted)" }}>
            <Loader2 className="size-3 animate-spin" />
            저장 중
          </span>
        )}
        {(saveStatus === "idle" || saveStatus === "saved") && (
          <span className="flex items-center gap-1" style={{ color: "var(--sw-text-muted)" }}>
            <span className="size-1.5 rounded-full" style={{ background: "var(--sw-success)" }} />
            저장됨
          </span>
        )}
        {aiAnalyzing && (
          <span
            className="flex items-center gap-1 rounded px-1.5 py-0.5"
            style={{
              background: "var(--sw-accent-bg)",
              color: "var(--sw-accent)",
            }}
          >
            <Loader2 className="size-3 animate-spin" />
            작품 기억 정리 중
          </span>
        )}
        {saveStatus === "error" && (
          <span className="flex items-center gap-1" style={{ color: "var(--sw-danger)" }}>
            <span className="size-1.5 rounded-full" style={{ background: "var(--sw-danger)" }} />
            저장 실패
          </span>
        )}
      </div>

      {/* Center: consistency check + save button */}
      <div className="flex items-center gap-2">
        <ConsistencyCheckButton chapterId={chapterId} />
        <button
          onClick={onSave}
          className="flex items-center gap-1 rounded-md px-3 py-0.5 text-[10px] font-medium transition-all"
          style={{
            background: "var(--sw-accent-bg)",
            border: "1px solid var(--sw-accent-border)",
            color: "var(--sw-accent)",
          }}
        >
          <Save className="size-3" />
          저장하고 기억 정리
        </button>
      </div>

      {/* Right: platform mode toggle */}
      <div className="flex flex-1 justify-end gap-1">
        {PLATFORMS.map((p) => {
          const isActive = platformMode === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPlatformModeChange(p.id)}
              className="rounded-[3px] px-2.5 py-0.5 text-[10.5px] transition-colors"
              style={{
                background: isActive ? "var(--sw-bg-raised)" : "transparent",
                border: `1px solid ${isActive ? "var(--sw-border-default)" : "transparent"}`,
                color: isActive ? "var(--sw-text-secondary)" : "var(--sw-text-muted)",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
