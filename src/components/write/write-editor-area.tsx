"use client";

import { memo, type RefObject } from "react";
import { WarningTooltip } from "@/components/editor/warning-tooltip";
import type { EntityHighlightItem } from "@/components/editor/entity-highlight-plugin";
import { TiptapEditor, type TiptapEditorRef } from "@/components/tiptap-editor";
import type { Chapter, InlineWarning } from "@/types";

interface WriteEditorAreaProps {
  activeChapter: Chapter;
  isSwitchingChapter: boolean;
  title: string;
  titleInputRef: RefObject<HTMLInputElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<TiptapEditorRef | null>;
  warnings: InlineWarning[];
  entityHighlights: EntityHighlightItem[];
  selectedEntityId: string | null;
  onTitleChange: (title: string) => void;
  onContentUpdate: (text: string) => void;
  onEntityClick: (entityId: string) => void;
  onBeforeReference: () => void;
  onEditorReady: () => void;
}

export const WriteEditorArea = memo(function WriteEditorArea({
  activeChapter,
  isSwitchingChapter,
  title,
  titleInputRef,
  containerRef,
  editorRef,
  warnings,
  entityHighlights,
  selectedEntityId,
  onTitleChange,
  onContentUpdate,
  onEntityClick,
  onBeforeReference,
  onEditorReady,
}: WriteEditorAreaProps) {
  return (
    <>
      <div
        className="shrink-0 px-4 pb-3 pt-4 sm:px-8 md:px-12 md:pb-4 md:pt-6"
        style={{
          background: "var(--sw-bg-surface)",
          borderBottom: "1px solid var(--sw-border-default)",
        }}
      >
        <div className="mx-auto" style={{ maxWidth: "680px" }}>
          <div
            className="mb-1 text-xs font-medium"
            style={{
              color: "var(--sw-accent)",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {String(activeChapter.chapter_num).padStart(2, "0")}화
          </div>
          <input
            ref={titleInputRef}
            value={title}
            disabled={isSwitchingChapter}
            aria-label="회차 제목"
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="제목 입력..."
            className="w-full bg-transparent text-[22px] font-bold leading-tight outline-none"
            style={{
              fontFamily: "'Noto Serif KR', serif",
              color: "var(--sw-text-primary)",
              letterSpacing: "0",
            }}
          />
        </div>
      </div>

      <div
        className="write-editor-body min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 md:px-12 md:py-7"
        ref={containerRef}
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--sw-border-hover) transparent",
        }}
      >
        <div className="mx-auto" style={{ maxWidth: "680px" }}>
          <TiptapEditor
            key={activeChapter.id}
            ref={editorRef}
            editable={!isSwitchingChapter}
            initialContent={activeChapter.content ?? ""}
            onUpdate={onContentUpdate}
            warnings={warnings}
            entities={entityHighlights}
            selectedEntityId={selectedEntityId}
            onEntityClick={onEntityClick}
            onBeforeReference={onBeforeReference}
            onReady={onEditorReady}
          />
          <WarningTooltip containerRef={containerRef} warnings={warnings} />
        </div>
      </div>
    </>
  );
});
