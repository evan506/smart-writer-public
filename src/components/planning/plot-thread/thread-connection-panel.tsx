"use client";

import { Trash2, X } from "lucide-react";
import type {
  PlotThreadChapterColumn,
  PlotThreadMatrix as PlotThreadMatrixModel,
  PlotThreadSummary,
} from "@/lib/services/plot-thread/read.service";
import type { PlotThreadLinkableBlock } from "./types";
import {
  deletePlotThread,
  linkThreadToChapter,
  linkThreadToPlanningBlock,
  unlinkThreadFromChapter,
  unlinkThreadFromPlanningBlock,
} from "@/app/(dashboard)/projects/[id]/plot-thread-actions";

export function ThreadConnectionPanel({
  projectId,
  selectedThread,
  matrix,
  isPending,
  run,
  blockToLink,
  setBlockToLink,
  linkableBlockOptions,
  chapterToLink,
  setChapterToLink,
  linkableChapterOptions,
  threadDirectChapterIds,
  chapterById,
}: {
  projectId: string;
  selectedThread: PlotThreadSummary;
  matrix: PlotThreadMatrixModel | null;
  isPending: boolean;
  run: (
    action: () => Promise<{ error: string | null }>,
    successText?: string
  ) => void;
  blockToLink: string;
  setBlockToLink: (v: string) => void;
  linkableBlockOptions: PlotThreadLinkableBlock[];
  chapterToLink: string;
  setChapterToLink: (v: string) => void;
  linkableChapterOptions: PlotThreadChapterColumn[];
  threadDirectChapterIds: string[];
  chapterById: Map<string, PlotThreadChapterColumn>;
}) {
  return (
    <section className="rounded-lg border border-sw-border-default bg-sw-bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-sw-text-secondary">
          스레드 연결 관리
        </h4>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(
              () =>
                deletePlotThread({
                  projectId,
                  threadId: selectedThread.id,
                }),
              "플롯 스레드를 삭제했습니다"
            )
          }
          className="inline-flex items-center gap-1 text-[11px] font-bold text-sw-danger hover:underline"
        >
          <Trash2 className="size-3.5" />
          삭제
        </button>
      </div>

      {/* Link planning block */}
      <label className="mt-3 block text-[11px] font-bold text-sw-text-muted">
        구상 카드 연결
      </label>
      <div className="mt-1 flex gap-2">
        <select
          aria-label="연결할 구상 카드"
          value={blockToLink}
          onChange={(e) => setBlockToLink(e.target.value)}
          className="min-h-9 flex-1 rounded-md border border-sw-border-default bg-sw-bg-elevated px-2 text-xs text-sw-text-primary"
        >
          <option value="">구상 카드 선택…</option>
          {linkableBlockOptions.map((b) => (
            <option key={b.id} value={b.id}>
              {b.title} ({b.pathLabel})
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending || !blockToLink}
          onClick={() =>
            run(async () => {
              const result = await linkThreadToPlanningBlock({
                projectId,
                threadId: selectedThread.id,
                planningBlockId: blockToLink,
              });
              if (!result.error) setBlockToLink("");
              return result;
            }, "구상 카드를 연결했습니다")
          }
          className="min-h-9 rounded-md border border-sw-accent-border bg-sw-accent-bg px-3 text-xs font-bold text-sw-accent disabled:opacity-50"
        >
          연결
        </button>
      </div>

      {/* Link chapter */}
      <label className="mt-3 block text-[11px] font-bold text-sw-text-muted">
        회차 직접 연결
      </label>
      <div className="mt-1 flex gap-2">
        <select
          aria-label="연결할 회차"
          value={chapterToLink}
          onChange={(e) => setChapterToLink(e.target.value)}
          className="min-h-9 flex-1 rounded-md border border-sw-border-default bg-sw-bg-elevated px-2 text-xs text-sw-text-primary"
        >
          <option value="">회차 선택…</option>
          {linkableChapterOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.chapterNum}화{c.title ? ` · ${c.title}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={isPending || !chapterToLink}
          onClick={() =>
            run(async () => {
              const result = await linkThreadToChapter({
                projectId,
                threadId: selectedThread.id,
                chapterId: chapterToLink,
              });
              if (!result.error) setChapterToLink("");
              return result;
            }, "회차를 연결했습니다")
          }
          className="min-h-9 rounded-md border border-sw-link-border bg-sw-link-soft px-3 text-xs font-bold text-sw-link disabled:opacity-50"
        >
          연결
        </button>
      </div>

      {/* Current links with unlink */}
      {matrix && matrix.rows.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold text-sw-text-muted">
            연결된 구상 카드
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {matrix.rows.map((row) => (
              <li
                key={row.blockId}
                className="flex items-center justify-between gap-2 rounded-md bg-sw-bg-elevated px-2 py-1.5"
              >
                <span className="truncate text-xs text-sw-text-secondary">
                  {row.title}
                </span>
                <button
                  type="button"
                  aria-label={`${row.title} 연결 해제`}
                  disabled={isPending}
                  onClick={() =>
                    run(() =>
                      unlinkThreadFromPlanningBlock({
                        projectId,
                        threadId: selectedThread.id,
                        planningBlockId: row.blockId,
                      })
                    )
                  }
                  className="text-sw-text-muted hover:text-sw-danger"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {threadDirectChapterIds.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] font-bold text-sw-text-muted">
            직접 연결한 회차
          </p>
          <ul className="mt-1 flex flex-wrap gap-1">
            {threadDirectChapterIds.map((chapterId) => {
              const chapter = chapterById.get(chapterId);
              if (!chapter) return null;
              return (
                <li key={chapterId}>
                  <button
                    type="button"
                    aria-label={`${chapter.chapterNum}화 직접 연결 해제`}
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        unlinkThreadFromChapter({
                          projectId,
                          threadId: selectedThread.id,
                          chapterId,
                        })
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-sw-link-border bg-sw-link-soft px-2 py-0.5 text-[11px] font-bold text-sw-link"
                  >
                    {chapter.chapterNum}화
                    <X className="size-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
