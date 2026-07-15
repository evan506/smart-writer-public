"use client";

import type { RefObject } from "react";
import { WarningTooltip } from "@/components/editor/warning-tooltip";
import type { EntityHighlightItem } from "@/components/editor/entity-highlight-plugin";
import { TiptapEditor, type TiptapEditorRef } from "@/components/tiptap-editor";
import type { Chapter, InlineWarning } from "@/types";

interface WriteEditorAreaProps {
  activeChapter: Chapter;
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
}

export function WriteEditorArea({
  activeChapter,
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
}: WriteEditorAreaProps) {
  return (
    <>
      <div
        className="shrink-0 px-12 pb-4 pt-6"
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
        className="write-editor-body flex-1 overflow-y-auto px-12 py-7"
        ref={containerRef}
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "var(--sw-border-hover) transparent",
        }}
      >
        <div className="mx-auto" style={{ maxWidth: "680px" }}>
          <TiptapEditor
            ref={editorRef}
            initialContent={activeChapter.content ?? ""}
            onUpdate={onContentUpdate}
            warnings={warnings}
            entities={entityHighlights}
            selectedEntityId={selectedEntityId}
            onEntityClick={onEntityClick}
          />
          <WarningTooltip containerRef={containerRef} warnings={warnings} />
        </div>
      </div>
    </>
  );
}
