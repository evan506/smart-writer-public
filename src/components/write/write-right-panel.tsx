"use client";

import { useState } from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { CanonQAPanel } from "@/components/canon-qa-panel";
import { EntitySuggestionPanel } from "@/components/entity-suggestion-panel";
import { CodexPanel } from "@/components/write/codex-panel";
import type { RightPanelTab } from "./write-workspace-types";

interface WriteRightPanelProps {
  projectId: string;
  chapterId?: string | null;
  saveSignal: number;
  codexRefreshSignal?: number;
  aiAnalyzing?: boolean;
  pendingSuggestionCount?: number;
  activeTab?: RightPanelTab;
  selectedEntityId?: string | null;
  onActiveTabChange?: (tab: RightPanelTab) => void;
  onSelectedEntityChange?: (entityId: string | null) => void;
  onSelectChapter?: (chapterId: string) => void;
  onPendingCountChange?: (count: number) => void;
  onAnalyzingChange?: (analyzing: boolean) => void;
  onMemoryChange?: () => void;
  onClose?: () => void;
}

const TABS = [
  { id: "codex", label: "사전" },
  { id: "qa", label: "질문" },
  { id: "suggestions", label: "확인" },
] as const;

export function WriteRightPanel({
  projectId,
  chapterId,
  saveSignal,
  codexRefreshSignal,
  aiAnalyzing = false,
  pendingSuggestionCount,
  activeTab,
  selectedEntityId,
  onActiveTabChange,
  onSelectedEntityChange,
  onSelectChapter,
  onPendingCountChange,
  onAnalyzingChange,
  onMemoryChange,
  onClose,
}: WriteRightPanelProps) {
  const [localActiveTab, setLocalActiveTab] = useState<RightPanelTab>("suggestions");
  const [localPendingCount, setLocalPendingCount] = useState<number | null>(
    pendingSuggestionCount && pendingSuggestionCount > 0 ? pendingSuggestionCount : null
  );
  const currentTab = activeTab ?? localActiveTab;

  const handleTabChange = (tab: RightPanelTab) => {
    setLocalActiveTab(tab);
    onActiveTabChange?.(tab);
  };

  const handlePendingCountChange = (count: number) => {
    setLocalPendingCount(count);
    onPendingCountChange?.(count);
  };

  return (
    <div
      className="flex h-full w-[320px] shrink-0 flex-col overflow-hidden"
      style={{ background: "var(--sw-bg-surface)" }}
    >
      {/* Tab bar with close toggle */}
      <div
        className="flex shrink-0 items-center px-1"
        style={{ borderBottom: "1px solid var(--sw-border-default)" }}
      >
        {/* Close toggle — same height as collapsed state */}
        <button
          onClick={onClose}
          aria-label="패널 접기"
          className="flex size-7 shrink-0 items-center justify-center rounded transition-colors hover:bg-sw-bg-hover"
          style={{ color: "var(--sw-text-muted)" }}
          title="패널 접기"
        >
          <ChevronRight className="size-3.5" />
        </button>

        {TABS.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className="relative flex-1 py-2.5 text-center text-xs font-medium transition-colors"
              style={{
                color: isActive ? "var(--sw-accent)" : "var(--sw-text-muted)",
                borderBottom: `2px solid ${isActive ? "var(--sw-accent)" : "transparent"}`,
              }}
            >
              <span className="inline-flex items-center justify-center gap-1">
                {tab.label}
                {tab.id === "suggestions" && aiAnalyzing && (
                  <Loader2 className="size-3 animate-spin" />
                )}
              </span>
              {tab.id === "suggestions" && localPendingCount !== null && localPendingCount > 0 && (
                <span
                  className="absolute right-[calc(50%-24px)] top-1.5 flex min-w-[16px] items-center justify-center rounded-full px-1 py-px text-[9px] font-bold leading-tight"
                  style={{
                    background: "var(--sw-warning)",
                    color: "#fffaf1",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {localPendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {currentTab === "codex" && (
          <div className="flex-1 overflow-hidden p-2.5">
            <CodexPanel
              projectId={projectId}
              saveSignal={codexRefreshSignal ?? saveSignal}
              selectedEntityId={selectedEntityId}
              onSelectedEntityChange={onSelectedEntityChange}
              onSelectChapter={onSelectChapter}
            />
          </div>
        )}

        {currentTab === "qa" && (
          <div
            className="flex-1 overflow-y-auto px-2.5 py-2 sw-scrollbar-surface"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "var(--sw-border-hover) var(--sw-bg-surface)",
            }}
          >
            <CanonQAPanel projectId={projectId} variant="panel" />
          </div>
        )}

        {currentTab === "suggestions" && (
          <div
            className="flex-1 overflow-y-auto px-2.5 py-2 sw-scrollbar-surface"
            style={{
              scrollbarWidth: "thin",
              scrollbarColor: "var(--sw-border-hover) var(--sw-bg-surface)",
            }}
          >
            <EntitySuggestionPanel
              projectId={projectId}
              chapterId={chapterId}
              saveSignal={saveSignal}
              onPendingCountChange={handlePendingCountChange}
              onAnalyzingChange={onAnalyzingChange}
              onMemoryChange={onMemoryChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
