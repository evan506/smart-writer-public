"use client";

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
  const workspace = useWriteWorkspace({
    projectId,
    projectName,
    projectGenre,
    initialChapters,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex flex-1 flex-col overflow-hidden"
          style={{ background: "var(--sw-bg-base)" }}
        >
          {workspace.activeChapter ? (
            <WriteEditorArea
              activeChapter={workspace.activeChapter}
              title={workspace.title}
              titleInputRef={workspace.titleInputRef}
              containerRef={workspace.containerRef}
              editorRef={workspace.editorRef}
              warnings={workspace.warnings}
              entityHighlights={workspace.entityHighlights}
              selectedEntityId={workspace.selectedEntityId}
              onTitleChange={workspace.handleTitleChange}
              onContentUpdate={workspace.handleContentUpdate}
              onEntityClick={workspace.handleEntityClick}
            />
          ) : (
            <WriteEmptyChapterState
              isCreatingFirstChapter={workspace.isCreatingFirstChapter}
              onCreateFirstChapter={workspace.handleCreateFirstChapter}
            />
          )}
        </div>

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
          onActiveTabChange={workspace.setRightPanelTab}
          onSelectedEntityChange={workspace.setSelectedEntityId}
          onSelectChapter={workspace.handleSelectChapterById}
          onPendingCountChange={workspace.setPendingSuggestionCount}
          onAnalyzingChange={workspace.setAiAnalyzing}
          onMemoryChange={workspace.handleMemoryChange}
          onClose={() => workspace.setRightPanelOpen(false)}
          onOpen={() => workspace.setRightPanelOpen(true)}
        />
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
