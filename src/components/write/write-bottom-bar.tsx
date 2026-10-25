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
  const { withSpaces, withoutSpaces, platformCount } = countChars(content, platformMode);
  const selectedPlatform = PLATFORMS.find((platform) => platform.id === platformMode)!;
  const countRule = platformMode === "novelpia"
    ? "앱 참고 집계: 공백과 일부 문장부호(.,!?;:\'\"()「」『』—…·)를 제외합니다. 플랫폼 공식 집계와 다를 수 있습니다."
    : platformMode === "munpia"
      ? "앱 참고 집계: 공백을 제외합니다. 플랫폼 공식 집계와 다를 수 있습니다."
      : "공백 포함은 줄바꿈과 탭을 포함하며, 공백 제외는 모든 공백 문자를 제외합니다.";

  return (
    <div
      className="write-bottom-bar flex shrink-0 flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs xl:h-8 xl:flex-nowrap xl:py-0 xl:text-[11px]"
      style={{
        background: "var(--sw-bg-surface)",
        borderTop: "1px solid var(--sw-border-default)",
      }}
    >
      {/* Left: char counts */}
      <div
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 xl:w-auto xl:flex-1"
        style={{ fontFamily: "'JetBrains Mono', monospace" }}
      >
        <select
          aria-label="글자 수 기준"
          value={platformMode}
          onChange={(event) => onPlatformModeChange(event.target.value as PlatformMode)}
          className="min-h-11 max-w-28 rounded border border-sw-border-default bg-sw-bg-surface px-2 xl:hidden"
        >
          {PLATFORMS.map((platform) => (
            <option key={platform.id} value={platform.id}>{platform.label}</option>
          ))}
        </select>
        <span role="group" aria-label="선택 기준 글자 수" title={countRule}>
          <span style={{ color: "var(--sw-text-muted)" }}>
            {platformMode === "default" ? "공백 포함 " : `${selectedPlatform.label} 참고 `}
          </span>
          <span className="font-medium" style={{ color: "var(--sw-text-secondary)" }}>
            {(platformMode === "default" ? withSpaces : platformCount).toLocaleString()}
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
        {/* Announce changes without interrupting writing. */}
        <span role="status" aria-live="polite" aria-atomic="true">
          {saveStatus === "pending" && (
            <span style={{ color: "var(--sw-text-muted)" }}>변경 있음 · 저장 대기</span>
          )}
          {saveStatus === "offline" && (
            <span style={{ color: "var(--sw-danger)" }}>오프라인 · 연결 후 저장해 주세요</span>
          )}
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
          {saveStatus === "error" && (
            <span style={{ color: "var(--sw-danger)" }}>저장 실패</span>
          )}
        </span>
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
      </div>

      {/* Center: consistency check + save button */}
      <div className="flex items-center gap-2">
        <ConsistencyCheckButton chapterId={chapterId} />
        <button
          onClick={onSave}
          disabled={!chapterId || saveStatus === "saving" || saveStatus === "offline"}
          className="flex min-h-11 items-center gap-1 rounded-md px-3 py-1 text-xs xl:min-h-0 xl:py-0.5 xl:text-[10px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--sw-accent-bg)",
            border: "1px solid var(--sw-accent-border)",
            color: "var(--sw-accent)",
          }}
        >
          <Save className="size-3" />
          {saveStatus === "error" ? "다시 저장" : "저장하고 기억 정리"}
        </button>
      </div>

      {/* Right: platform mode toggle */}
      <div className="hidden justify-end gap-1 xl:flex xl:flex-1">
        {PLATFORMS.map((p) => {
          const isActive = platformMode === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPlatformModeChange(p.id)}
              aria-pressed={isActive}
              className="min-h-11 rounded px-2 py-1 text-xs xl:min-h-0 xl:py-0.5 xl:text-[10.5px] transition-colors"
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
