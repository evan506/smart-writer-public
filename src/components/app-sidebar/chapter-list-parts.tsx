"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import type { Chapter } from "@/types";

interface ChapterListProps {
  chapters: Chapter[];
  activeChapterId: string | null;
  isCreating: boolean;
  onCreate: () => void;
  onSelectChapter: (chapter: Chapter) => void;
}

export function ExpandedChapterList({
  projectName,
  projectGenre,
  chapters,
  activeChapterId,
  isCreating,
  onCreate,
  onSelectChapter,
  onDeleteChapter,
}: ChapterListProps & {
  projectName: string;
  projectGenre: string | null;
  onDeleteChapter: (chapter: Chapter) => void;
}) {
  return (
    <SidebarGroup className="flex-1 overflow-hidden flex flex-col !py-0">
      <SidebarGroupContent className="flex-1 overflow-hidden flex flex-col">
        <div className="px-3 pb-2 pt-1 flex items-center gap-2 min-w-0">
          <span
            className="text-xs font-bold truncate"
            style={{ color: "var(--sw-text-primary)" }}
          >
            {projectName}
          </span>
          {projectGenre && <ProjectGenreBadge genre={projectGenre} />}
        </div>

        <div className="flex items-center justify-between px-3 pb-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--sw-text-dim)" }}
          >
            챕터
          </span>
          <CreateChapterButton isCreating={isCreating} onCreate={onCreate} />
        </div>

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 pb-2 sw-scrollbar"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "var(--sw-border-default) transparent",
          }}
        >
          {chapters.map((chapter) => (
            <ExpandedChapterRow
              key={chapter.id}
              chapter={chapter}
              isActive={chapter.id === activeChapterId}
              onSelect={onSelectChapter}
              onDelete={onDeleteChapter}
            />
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function CollapsedChapterList({
  chapters,
  activeChapterId,
  isCreating,
  onCreate,
  onSelectChapter,
}: ChapterListProps) {
  return (
    <SidebarGroup className="flex-1 overflow-hidden flex flex-col !py-0">
      <SidebarGroupContent className="flex-1 overflow-hidden flex flex-col items-center">
        <CreateChapterButton isCreating={isCreating} onCreate={onCreate} collapsed />

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center gap-1 pb-2 sw-scrollbar"
          style={{
            scrollbarWidth: "thin",
            scrollbarColor: "var(--sw-border-default) transparent",
          }}
        >
          {chapters.map((chapter) => (
            <CollapsedChapterButton
              key={chapter.id}
              chapter={chapter}
              isActive={chapter.id === activeChapterId}
              onSelect={onSelectChapter}
            />
          ))}
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function ExpandedChapterRow({
  chapter,
  isActive,
  onSelect,
  onDelete,
}: {
  chapter: Chapter;
  isActive: boolean;
  onSelect: (chapter: Chapter) => void;
  onDelete: (chapter: Chapter) => void;
}) {
  const pending = hasPendingSuggestions(chapter);

  return (
    <div className="group/row relative mb-0.5">
      <button
        onClick={() => onSelect(chapter)}
        className="flex w-full items-center justify-between gap-1.5 rounded-md px-2 py-[6px] text-left transition-all"
        style={{
          background: isActive ? "var(--sw-bg-active)" : "transparent",
          border: isActive
            ? "1px solid var(--sw-border-focus)"
            : "1px solid transparent",
        }}
      >
        <ChapterLabel chapter={chapter} isActive={isActive} />
        {pending && (
          <span
            className="size-[7px] shrink-0 rounded-full"
            style={{ background: "var(--sw-warning)" }}
          />
        )}
      </button>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onDelete(chapter);
        }}
        className="absolute right-1 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded opacity-0 transition-opacity group-hover/row:opacity-100"
        style={{ color: "var(--sw-text-dim)" }}
        aria-label="챕터 삭제"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

function CollapsedChapterButton({
  chapter,
  isActive,
  onSelect,
}: {
  chapter: Chapter;
  isActive: boolean;
  onSelect: (chapter: Chapter) => void;
}) {
  const pending = hasPendingSuggestions(chapter);

  return (
    <button
      onClick={() => onSelect(chapter)}
      className="relative flex size-8 items-center justify-center rounded-md transition-all"
      style={{
        fontSize: "10px",
        fontFamily: "'JetBrains Mono', monospace",
        color: isActive ? "var(--sw-text-primary)" : "var(--sw-text-dim)",
        background: isActive ? "var(--sw-bg-active)" : "transparent",
        border: isActive
          ? "1px solid var(--sw-border-focus)"
          : "1px solid transparent",
      }}
      title={chapter.title || `제${chapter.chapter_num}화`}
    >
      {String(chapter.chapter_num).padStart(2, "0")}
      {pending && (
        <span
          className="absolute right-[2px] top-[2px] size-[5px] rounded-full"
          style={{ background: "var(--sw-warning)" }}
        />
      )}
    </button>
  );
}

function ChapterLabel({ chapter, isActive }: { chapter: Chapter; isActive: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span
        className="shrink-0 text-[10px] font-medium"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          color: isActive ? "var(--sw-text-muted)" : "var(--sw-text-dim)",
          minWidth: "18px",
          textAlign: "right",
        }}
      >
        {String(chapter.chapter_num).padStart(2, "0")}
      </span>
      <span
        className="truncate text-[12px]"
        style={{
          color: isActive ? "var(--sw-text-primary)" : "var(--sw-text-muted)",
          maxWidth: "120px",
        }}
      >
        {chapter.title || `제${chapter.chapter_num}화`}
      </span>
    </div>
  );
}

function CreateChapterButton({
  isCreating,
  onCreate,
  collapsed = false,
}: {
  isCreating: boolean;
  onCreate: () => void;
  collapsed?: boolean;
}) {
  return (
    <button
      onClick={onCreate}
      disabled={isCreating}
      aria-label="새 챕터 만들기"
      className={`${collapsed ? "my-1 size-7" : "size-[18px]"} flex items-center justify-center rounded text-sm transition-all`}
      style={{ color: "var(--sw-accent)" }}
      title="새 챕터 만들기"
    >
      {isCreating ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Plus className="size-3.5" />
      )}
    </button>
  );
}

function ProjectGenreBadge({ genre }: { genre: string }) {
  return (
    <span
      className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold"
      style={{
        color: "var(--sw-accent)",
        background: "var(--sw-bg-active)",
        border: "1px solid var(--sw-border-focus)",
      }}
    >
      {genre}
    </span>
  );
}

function hasPendingSuggestions(_chapter: Chapter): boolean {
  void _chapter;
  return false;
}
