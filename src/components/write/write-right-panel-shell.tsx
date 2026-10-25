"use client";

import { useIsMobile } from "@/hooks/use-mobile";
import { ChevronLeft } from "lucide-react";
import { WriteRightPanel } from "./write-right-panel";
import type { RightPanelTab } from "./write-workspace-types";

interface WriteRightPanelShellProps {
  projectId: string;
  chapterId: string | null;
  saveSignal: number;
  codexRefreshSignal: number;
  aiAnalyzing: boolean;
  pendingSuggestionCount: number;
  activeTab: RightPanelTab;
  selectedEntityId: string | null;
  isOpen: boolean;
  mobileOpen: boolean;
  onActiveTabChange: (tab: RightPanelTab) => void;
  onSelectedEntityChange: (entityId: string | null) => void;
  onSelectChapter: (chapterId: string) => void | Promise<void>;
  onPendingCountChange: (count: number) => void;
  onAnalyzingChange: (analyzing: boolean) => void;
  onMemoryChange: () => void;
  onClose: () => void;
  onOpen: () => void;
}

export function WriteRightPanelShell({
  projectId,
  chapterId,
  saveSignal,
  codexRefreshSignal,
  aiAnalyzing,
  pendingSuggestionCount,
  activeTab,
  selectedEntityId,
  isOpen,
  mobileOpen,
  onActiveTabChange,
  onSelectedEntityChange,
  onSelectChapter,
  onPendingCountChange,
  onAnalyzingChange,
  onMemoryChange,
  onClose,
  onOpen,
}: WriteRightPanelShellProps) {
  const isMobile = useIsMobile(1024);
  return (
    <div
      className={`relative min-w-0 shrink-0 overflow-hidden lg:block motion-safe:transition-[width] motion-safe:duration-200 ${mobileOpen ? "block w-full" : "hidden"} ${isOpen ? "lg:w-[320px]" : "lg:w-9"}`}
      style={{ borderLeft: "1px solid var(--sw-border-default)" }}
    >
      <div
        className="h-full w-full lg:w-[320px]"
        inert={!(isMobile ? mobileOpen : isOpen) || undefined}
      >
        <WriteRightPanel
          projectId={projectId}
          chapterId={chapterId}
          saveSignal={saveSignal}
          codexRefreshSignal={codexRefreshSignal}
          aiAnalyzing={aiAnalyzing}
          pendingSuggestionCount={pendingSuggestionCount}
          activeTab={activeTab}
          selectedEntityId={selectedEntityId}
          onActiveTabChange={onActiveTabChange}
          onSelectedEntityChange={onSelectedEntityChange}
          onSelectChapter={onSelectChapter}
          onPendingCountChange={onPendingCountChange}
          onAnalyzingChange={onAnalyzingChange}
          onMemoryChange={onMemoryChange}
          onClose={onClose}
        />
      </div>

      <button
        type="button"
        tabIndex={isOpen ? -1 : 0}
        aria-hidden={isOpen}
        className="absolute inset-0 hidden w-9 lg:flex flex-col items-center gap-3 pt-3 transition-opacity duration-200 ease-linear"
        aria-label="우측 패널 열기"
        title="우측 패널 열기"
        style={{
          background: "var(--sw-bg-surface)",
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? "none" : "auto",
          cursor: "pointer",
          zIndex: 1,
        }}
        onClick={onOpen}
      >
        <ChevronLeft className="size-3.5" style={{ color: "var(--sw-text-muted)" }} />
        <span
          className="text-[11px]"
          style={{ color: "var(--sw-text-muted)", writingMode: "vertical-rl" }}
        >
          패널
        </span>
        {pendingSuggestionCount > 0 && (
          <span
            className="flex size-5 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: "var(--sw-warning)", color: "#fffaf1" }}
          >
            {pendingSuggestionCount}
          </span>
        )}
      </button>
    </div>
  );
}
