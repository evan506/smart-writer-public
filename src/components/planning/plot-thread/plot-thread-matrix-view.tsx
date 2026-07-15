"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  PlotThreadChapterColumn,
  PlotThreadMatrix as PlotThreadMatrixModel,
  PlotThreadSummary,
} from "@/lib/services/plot-thread/read.service";
import { PLOT_THREAD_COPY } from "@/lib/planning/plot-thread-constants";
import { PlotThreadMatrix, type SelectedCell } from "./plot-thread-matrix";
import { PlotThreadInspector } from "./plot-thread-inspector";
import { ThreadCreate } from "./thread-create";
import { ThreadList } from "./thread-list";
import { ThreadEditForm } from "./thread-edit-form";
import { ThreadConnectionPanel } from "./thread-connection-panel";
import {
  PlotThreadNoticeBanner,
  type PlotThreadNotice,
} from "./plot-thread-notice";
import type { PlotThreadLinkableBlock } from "./types";
import {
  createPlotThread,
  updatePlotThread,
} from "@/app/(dashboard)/projects/[id]/plot-thread-actions";

export type { PlotThreadLinkableBlock } from "./types";

interface PlotThreadMatrixViewProps {
  projectId: string;
  threads: PlotThreadSummary[];
  chapters: PlotThreadChapterColumn[];
  matrices: Record<string, PlotThreadMatrixModel>;
  linkableBlocks: PlotThreadLinkableBlock[];
  onSwitchToTree: () => void;
}

export function PlotThreadMatrixView({
  projectId,
  threads,
  chapters,
  matrices,
  linkableBlocks,
  onSwitchToTree,
}: PlotThreadMatrixViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    threads[0]?.id ?? null
  );
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [showAllChapters, setShowAllChapters] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [blockToLink, setBlockToLink] = useState("");
  const [chapterToLink, setChapterToLink] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [notice, setNotice] = useState<PlotThreadNotice>(null);

  const selectedThread =
    threads.find((t) => t.id === selectedThreadId) ?? threads[0] ?? null;
  const matrix = selectedThread ? matrices[selectedThread.id] ?? null : null;

  // Keep the edit form in sync with the currently selected thread (and with
  // server-refreshed values after a save).
  const selectedThreadKey = `${selectedThread?.id ?? ""}|${selectedThread?.title ?? ""}|${selectedThread?.summary ?? ""}`;
  useEffect(() => {
    setEditTitle(selectedThread?.title ?? "");
    setEditSummary(selectedThread?.summary ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadKey]);

  const chapterById = useMemo(
    () => new Map(chapters.map((c) => [c.id, c])),
    [chapters]
  );

  const visibleColumns = useMemo(() => {
    if (!matrix) return [];
    if (showAllChapters) return chapters;
    const signal = new Set(matrix.signalChapterIds);
    return chapters.filter((c) => signal.has(c.id));
  }, [chapters, matrix, showAllChapters]);

  // thread-direct chapter links (for the unlink list), derived from summary cells
  const threadDirectChapterIds = useMemo(() => {
    if (!matrix) return [] as string[];
    return matrix.summaryRow.cells
      .filter((cell) =>
        cell.manualSources.some((s) => s.kind === "thread_chapter")
      )
      .map((cell) => cell.chapterId);
  }, [matrix]);

  const linkedBlockIds = useMemo(
    () => new Set(matrix?.rows.map((r) => r.blockId) ?? []),
    [matrix]
  );
  const linkableBlockOptions = linkableBlocks.filter(
    (b) => !linkedBlockIds.has(b.id)
  );
  const linkableChapterOptions = chapters.filter(
    (c) => !threadDirectChapterIds.includes(c.id)
  );

  function run(
    action: () => Promise<{ error: string | null }>,
    successText?: string
  ) {
    setNotice(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setNotice({ tone: "error", text: result.error });
        return;
      }
      if (successText) setNotice({ tone: "success", text: successText });
      router.refresh();
    });
  }

  function selectThread(id: string) {
    setSelectedThreadId(id);
    setSelectedCell(null);
    setShowAllChapters(false);
  }

  function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    run(async () => {
      const result = await createPlotThread({ projectId, title, summary: null });
      if (!result.error) {
        setNewTitle("");
        if (result.id) setSelectedThreadId(result.id);
      }
      return { error: result.error };
    }, "플롯 스레드를 추가했습니다");
  }

  function handleSaveEdit() {
    if (!selectedThread) return;
    const title = editTitle.trim();
    if (!title) {
      setNotice({ tone: "error", text: "플롯 스레드 제목을 입력하세요" });
      return;
    }
    const summary = editSummary.trim() ? editSummary.trim() : null;
    run(
      () =>
        updatePlotThread({
          projectId,
          threadId: selectedThread.id,
          title,
          summary,
        }),
      "플롯 스레드를 수정했습니다"
    );
  }

  if (threads.length === 0) {
    return (
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ThreadCreate
          value={newTitle}
          onChange={setNewTitle}
          onSubmit={handleCreate}
          disabled={isPending}
        />
        <section className="rounded-lg border border-sw-border-default bg-sw-bg-surface p-6">
          <p className="text-sm leading-6 text-sw-text-muted">
            {PLOT_THREAD_COPY.emptyThreads}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PlotThreadNoticeBanner notice={notice} />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_300px]">
        {/* Thread list + management */}
        <div className="flex flex-col gap-3">
          <ThreadList
            threads={threads}
            selectedThreadId={selectedThread?.id ?? null}
            onSelect={selectThread}
          />

          <ThreadCreate
            value={newTitle}
            onChange={setNewTitle}
            onSubmit={handleCreate}
            disabled={isPending}
          />

          {selectedThread && (
            <ThreadEditForm
              title={editTitle}
              onTitleChange={setEditTitle}
              summary={editSummary}
              onSummaryChange={setEditSummary}
              onSubmit={handleSaveEdit}
              disabled={isPending}
            />
          )}

          {selectedThread && (
            <ThreadConnectionPanel
              projectId={projectId}
              selectedThread={selectedThread}
              matrix={matrix}
              isPending={isPending}
              run={run}
              blockToLink={blockToLink}
              setBlockToLink={setBlockToLink}
              linkableBlockOptions={linkableBlockOptions}
              chapterToLink={chapterToLink}
              setChapterToLink={setChapterToLink}
              linkableChapterOptions={linkableChapterOptions}
              threadDirectChapterIds={threadDirectChapterIds}
              chapterById={chapterById}
            />
          )}
        </div>

        {/* Matrix */}
        <div className="min-w-0">
          {matrix ? (
            <PlotThreadMatrix
              matrix={matrix}
              columns={visibleColumns}
              totalChapterCount={chapters.length}
              showAllChapters={showAllChapters}
              onToggleShowAll={() => setShowAllChapters((v) => !v)}
              selected={
                selectedCell
                  ? {
                      rowKey: selectedCell.rowKey,
                      chapterId: selectedCell.chapter.id,
                    }
                  : null
              }
              onSelectCell={setSelectedCell}
            />
          ) : null}
        </div>

        {/* Inspector */}
        <div className="min-w-0 xl:block">
          <PlotThreadInspector
            projectId={projectId}
            threadTitle={selectedThread?.title ?? ""}
            selected={selectedCell}
            onSwitchToTree={onSwitchToTree}
          />
        </div>
      </div>
    </div>
  );
}
