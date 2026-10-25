"use client";

import { useCallback, useState } from "react";
import { WriteBottomBar } from "./write-bottom-bar";
import { useWriteWorkspace } from "./use-write-workspace";
import { WriteEditorArea } from "./write-editor-area";
import { WriteEmptyChapterState } from "./write-empty-chapter-state";
import { WriteRightPanelShell } from "./write-right-panel-shell";
import type { WriteWorkspaceProps } from "./write-workspace-types";

export function WriteWorkspace({
  projectId,
  projectName,
  projectGenre,
  initialChapters,
}: WriteWorkspaceProps) {
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const workspace = useWriteWorkspace({
    projectId,
    projectName,
    projectGenre,
    initialChapters,
  });

  const { handleEntityClick } = workspace;
  const handleEditorEntityClick = useCallback((id: string) => {
    handleEntityClick(id);
    setMobilePanelOpen(true);
  }, [handleEntityClick]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <nav aria-label="집필 도구" className="grid shrink-0 grid-cols-4 border-b border-sw-border-default bg-sw-bg-surface lg:hidden">
        {([{ id: "editor", label: "원고" }, { id: "codex", label: "사전" }, { id: "qa", label: "질문" }, { id: "suggestions", label: "확인" }] as const).map((tab) => (
          <button key={tab.id} type="button" aria-pressed={tab.id === "editor" ? !mobilePanelOpen : mobilePanelOpen && workspace.rightPanelTab === tab.id}
            className="min-h-11 border-b-2 border-transparent text-sm text-sw-text-muted aria-pressed:border-sw-accent aria-pressed:text-sw-accent"
            onClick={() => {
              setMobilePanelOpen(tab.id !== "editor");
              if (tab.id !== "editor") workspace.setRightPanelTab(tab.id);
            }}>{tab.label}</button>
        ))}
      </nav>
      {workspace.referenceChapter && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-sw-border-default bg-sw-bg-surface px-4 py-1.5 text-xs text-sw-text-muted">
          <span className="truncate">
            {workspace.referenceChapter.chapter_num}화 · {workspace.referenceChapter.title || "제목 없음"}
          </span>
          <button type="button" className="min-h-9 shrink-0 rounded-md border border-sw-accent-border bg-sw-accent-bg px-3 font-medium text-sw-accent disabled:opacity-50"
            disabled={workspace.isSwitchingChapter || workspace.isReturningToWriting}
            onClick={async () => {
              if (await workspace.handleReturnToWriting()) {
                setMobilePanelOpen(false);
              }
            }}>
            쓰던 자리로 돌아가기
          </button>
        </div>
      )}
      {workspace.isSwitchingChapter && (
        <p className="px-6 py-2 text-sm" aria-live="polite" style={{ color: "var(--sw-text-muted)" }}>
          원고를 저장하고 있습니다. 잠시 기다려 주세요.
        </p>
      )}
      {workspace.navigationError && (
        <div role="alert" className="flex items-center gap-3 px-6 py-2 text-sm" style={{ color: "var(--sw-warning)" }}>
          <span>{workspace.navigationError}</span>
          <button type="button" onClick={workspace.handleRetryNavigation} className="shrink-0 underline">
            저장 후 이동 재시도
          </button>
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <div
          className={`${mobilePanelOpen ? "hidden lg:flex" : "flex"} min-w-0 flex-1 flex-col overflow-hidden`}
          style={{ background: "var(--sw-bg-base)" }}
        >
          {workspace.activeChapter ? (
            <WriteEditorArea
              activeChapter={workspace.activeChapter}
              isSwitchingChapter={workspace.isSwitchingChapter}
              title={workspace.title}
              titleInputRef={workspace.titleInputRef}
              containerRef={workspace.containerRef}
              editorRef={workspace.editorRef}
              warnings={workspace.warnings}
              entityHighlights={workspace.entityHighlights}
              selectedEntityId={workspace.selectedEntityId}
              onTitleChange={workspace.handleTitleChange}
              onContentUpdate={workspace.handleContentUpdate}
              onEntityClick={handleEditorEntityClick}
              onBeforeReference={workspace.handleReferenceCapture}
              onEditorReady={workspace.onEditorReady}
            />
          ) : (
            <WriteEmptyChapterState
              isCreatingFirstChapter={workspace.isCreatingFirstChapter}
              onCreateFirstChapter={workspace.handleCreateFirstChapter}
            />
          )}
        </div>

        <div className="contents" onPointerDownCapture={workspace.handleReferenceCapture} onFocusCapture={workspace.handleReferenceCapture}
          onClickCapture={workspace.handleReferenceStart} onKeyUpCapture={workspace.handleReferenceStart}>
          <WriteRightPanelShell
            projectId={workspace.projectId}
            chapterId={workspace.activeChapterId}
            saveSignal={workspace.saveSignal}
            codexRefreshSignal={workspace.codexRefreshSignal}
            aiAnalyzing={workspace.aiAnalyzing}
            pendingSuggestionCount={workspace.pendingSuggestionCount}
            activeTab={workspace.rightPanelTab}
            selectedEntityId={workspace.selectedEntityId}
            isOpen={workspace.rightPanelOpen}
            mobileOpen={mobilePanelOpen}
            onActiveTabChange={workspace.setRightPanelTab}
            onSelectedEntityChange={workspace.setSelectedEntityId}
            onSelectChapter={async (id) => { await workspace.handleSelectChapterById(id); setMobilePanelOpen(false); }}
            onPendingCountChange={workspace.setPendingSuggestionCount}
            onAnalyzingChange={workspace.setAiAnalyzing}
            onMemoryChange={workspace.handleMemoryChange}
            onClose={() => { workspace.handleCloseReferencePanel(); setMobilePanelOpen(false); }}
            onOpen={() => workspace.setRightPanelOpen(true)}
          />
        </div>
      </div>

      <WriteBottomBar
        content={workspace.content}
        platformMode={workspace.platformMode}
        onPlatformModeChange={workspace.setPlatformMode}
        saveStatus={workspace.saveStatus}
        aiAnalyzing={workspace.aiAnalyzing}
        onSave={workspace.handleSaveClick}
        chapterId={workspace.activeChapterId}
      />
    </div>
  );
}
