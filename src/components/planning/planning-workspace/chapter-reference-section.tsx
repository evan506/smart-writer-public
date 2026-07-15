"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, Link2, Unlink } from "lucide-react";
import type { Chapter } from "@/types";
import type { PendingAction } from "./types";
import { formatChapterTitle } from "./format";
import { PlanningDropdown } from "./planning-dropdown";

export function ChapterReferenceSection({
  projectId,
  selectedCanReferenceChapter,
  chapters,
  referencedChapters,
  chapterReferenceId,
  setChapterReferenceId,
  isPending,
  pendingAction,
  onLink,
  onUnlink,
}: {
  projectId: string;
  selectedCanReferenceChapter: boolean;
  chapters: Array<Pick<Chapter, "id" | "chapter_num" | "title" | "updated_at">>;
  referencedChapters: Array<
    Pick<Chapter, "id" | "chapter_num" | "title" | "updated_at">
  >;
  chapterReferenceId: string;
  setChapterReferenceId: (chapterId: string) => void;
  isPending: boolean;
  pendingAction: PendingAction;
  onLink: () => void;
  onUnlink: (chapterId: string) => void;
}) {
  const chapterDropdownOptions = useMemo(
    () => [
      {
        value: "",
        label:
          chapters.length === 0 ? "참조할 기존 회차가 없습니다" : "기존 회차 선택",
        disabled: true,
      },
      ...chapters.map((chapter) => ({
        value: chapter.id,
        label: formatChapterTitle(chapter),
      })),
    ],
    [chapters]
  );

  return (
    <details className="group rounded-md border border-sw-border-default bg-sw-bg-elevated p-3 shadow-[0_8px_20px_rgba(61,43,22,0.04)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md text-sm font-bold text-sw-text-primary outline-none focus-visible:ring-2 focus-visible:ring-sw-border-focus [&::-webkit-details-marker]:hidden">
        <span className="inline-flex items-center gap-2">
          <Link2 className="size-4 text-sw-accent" />
          원고 참조
        </span>
        <span className="inline-flex items-center gap-2 text-[11px] font-bold text-sw-text-muted">
          {referencedChapters.length > 0 ? "참조 중" : "선택 사항"}
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="mt-3 grid gap-3 border-t border-sw-border-subtle pt-3">
        {!selectedCanReferenceChapter && (
          <p className="rounded-md border border-sw-border-subtle bg-sw-bg-surface px-3 py-2 text-xs leading-5 text-sw-text-muted">
            기존 회차 참조는 화 카드에서만 사용할 수 있습니다. 계획과 원고는
            수동으로만 연결됩니다.
          </p>
        )}

        {selectedCanReferenceChapter && referencedChapters.length === 0 && (
          <p className="text-xs leading-5 text-sw-text-muted">
            참조된 원고 회차가 없습니다. 필요한 경우에만 기존 회차를 선택하세요.
          </p>
        )}

        {referencedChapters.map((chapter) => (
          <div
            key={chapter.id}
            className="rounded-md border border-sw-accent-border bg-sw-accent-bg p-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-bold text-sw-accent">
                  <Link2 className="size-3.5" />
                  기존 회차 참조
                </div>
                <p className="truncate text-sm font-bold text-sw-text-primary">
                  {formatChapterTitle(chapter)}
                </p>
                <p className="mt-1 text-xs text-sw-text-muted">
                  원고와 canon은 자동 변경되지 않습니다.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/projects/${projectId}/write?chapter=${chapter.id}`}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-sw-border-default bg-sw-bg-surface px-2 text-xs font-bold text-sw-text-muted hover:border-sw-accent-border hover:text-sw-accent"
                >
                  <ExternalLink className="size-3.5" />
                  열기
                </Link>
                <button
                  type="button"
                  onClick={() => onUnlink(chapter.id)}
                  disabled={isPending}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-sw-border-default bg-sw-bg-surface px-2 text-xs font-bold text-sw-text-muted hover:border-sw-danger hover:text-sw-danger disabled:opacity-60"
                >
                  <Unlink className="size-3.5" />
                  {pendingAction === "unlink" ? "해제 중" : "해제"}
                </button>
              </div>
            </div>
          </div>
        ))}

        {selectedCanReferenceChapter && (
          <div className="grid gap-2">
            <PlanningDropdown
              ariaLabel="참조할 기존 회차"
              value={chapterReferenceId}
              onChange={setChapterReferenceId}
              options={chapterDropdownOptions}
              disabled={chapters.length === 0 || isPending}
              compact
            />
            <button
              type="button"
              onClick={onLink}
              disabled={!chapterReferenceId || isPending}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-sw-border-default bg-sw-bg-surface px-3 text-sm font-bold text-sw-text-primary hover:border-sw-accent-border hover:text-sw-accent disabled:opacity-60"
            >
              <Link2 className="size-4" />
              {pendingAction === "link" ? "참조 중" : "기존 회차 참조"}
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
