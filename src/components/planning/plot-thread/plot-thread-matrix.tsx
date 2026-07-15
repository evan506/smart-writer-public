"use client";

import { ArrowUpRight, Check } from "lucide-react";
import type {
  PlotThreadCell,
  PlotThreadChapterColumn,
  PlotThreadMatrix as PlotThreadMatrixModel,
} from "@/lib/services/plot-thread/read.service";
import {
  PLOT_THREAD_COPY,
  PLOT_THREAD_LEGEND,
  PLOT_THREAD_SIGNAL_LABELS,
  type PlotThreadCellSignal,
} from "@/lib/planning/plot-thread-constants";

export const SUMMARY_ROW_KEY = "__summary__";

export interface SelectedCell {
  rowKey: string;
  rowLabel: string;
  chapter: PlotThreadChapterColumn;
  cell: PlotThreadCell;
}

interface PlotThreadMatrixProps {
  matrix: PlotThreadMatrixModel;
  columns: PlotThreadChapterColumn[];
  totalChapterCount: number;
  showAllChapters: boolean;
  onToggleShowAll: () => void;
  selected: { rowKey: string; chapterId: string } | null;
  onSelectCell: (selection: SelectedCell) => void;
}

const SIGNAL_CELL_CLASS: Record<PlotThreadCellSignal, string> = {
  manual:
    "border-sw-link-border bg-sw-link-soft text-sw-link",
  evidence:
    "border-sw-accent-border bg-sw-accent-bg text-sw-accent",
  "manual+evidence":
    "border-sw-accent-border bg-sw-accent-bg text-sw-accent",
  empty: "border-sw-border-default bg-transparent text-sw-text-ghost",
};

function CellMarker({ signal }: { signal: PlotThreadCellSignal }) {
  if (signal === "empty") {
    return <span aria-hidden="true">·</span>;
  }
  return (
    <span aria-hidden="true" className="inline-flex items-center gap-0.5">
      {(signal === "manual" || signal === "manual+evidence") && (
        <ArrowUpRight className="size-3.5" />
      )}
      {(signal === "evidence" || signal === "manual+evidence") && (
        <Check className="size-3.5" />
      )}
    </span>
  );
}

function chapterColLabel(chapter: PlotThreadChapterColumn) {
  return `${chapter.chapterNum}화${chapter.title ? ` · ${chapter.title}` : ""}`;
}

export function PlotThreadMatrix({
  matrix,
  columns,
  totalChapterCount,
  showAllChapters,
  onToggleShowAll,
  selected,
  onSelectCell,
}: PlotThreadMatrixProps) {
  const hasRows = matrix.rows.length > 0;

  function cellFor(cells: PlotThreadCell[], chapterId: string) {
    return cells.find((c) => c.chapterId === chapterId) ?? null;
  }

  function renderCellButton(
    rowKey: string,
    rowLabel: string,
    chapter: PlotThreadChapterColumn,
    cell: PlotThreadCell | null
  ) {
    if (!cell) return null;
    const isSelected =
      selected?.rowKey === rowKey && selected?.chapterId === chapter.id;
    const label = `${rowLabel} ${chapter.chapterNum}화: ${
      PLOT_THREAD_SIGNAL_LABELS[cell.signal]
    }`;
    return (
      <button
        type="button"
        aria-label={label}
        aria-pressed={isSelected}
        title={PLOT_THREAD_SIGNAL_LABELS[cell.signal]}
        onClick={() => onSelectCell({ rowKey, rowLabel, chapter, cell })}
        className={`inline-flex size-8 items-center justify-center rounded-md border text-xs font-bold transition-colors ${
          SIGNAL_CELL_CLASS[cell.signal]
        } ${
          isSelected
            ? "ring-2 ring-sw-border-focus"
            : "hover:border-sw-border-hover"
        }`}
      >
        <CellMarker signal={cell.signal} />
        {cell.evidenceCount > 1 && (
          <span className="ml-0.5 text-[10px]">{cell.evidenceCount}</span>
        )}
      </button>
    );
  }

  return (
    <section className="rounded-lg border border-sw-border-default bg-sw-bg-surface">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sw-border-default px-4 py-3">
        <div>
          <p className="text-xs font-bold text-sw-accent">EPISODE MAP</p>
          <h3 className="mt-1 text-base font-bold">{matrix.title}</h3>
          {matrix.summary && (
            <p className="mt-1 text-xs leading-5 text-sw-text-muted">
              {matrix.summary}
            </p>
          )}
        </div>
        {totalChapterCount > 0 && (
          <button
            type="button"
            onClick={onToggleShowAll}
            className="min-h-8 rounded-md border border-sw-border-default bg-sw-bg-elevated px-3 text-xs font-semibold text-sw-text-muted hover:border-sw-accent-border hover:text-sw-accent"
          >
            {showAllChapters
              ? PLOT_THREAD_COPY.showSignalChapters
              : PLOT_THREAD_COPY.showAllChapters}
          </button>
        )}
      </div>

      {/* Legend */}
      <ul className="flex flex-wrap gap-3 px-4 py-2.5 text-[11px] text-sw-text-muted">
        {PLOT_THREAD_LEGEND.map((item) => (
          <li key={item.signal} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block size-3 rounded-[3px] border ${SIGNAL_CELL_CLASS[item.signal]}`}
            />
            {item.label}
          </li>
        ))}
      </ul>

      {columns.length === 0 ? (
        <p className="px-4 py-6 text-sm text-sw-text-muted">
          {PLOT_THREAD_COPY.emptyEvidenceCell}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                {matrix.title} 플롯 스레드의 구상 카드별 회차 연결과 원문 근거
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 min-w-44 border-b border-r border-sw-border-default bg-sw-bg-raised px-4 py-2 text-left text-xs font-bold text-sw-text-muted"
                  >
                    구상 / 사건
                  </th>
                  {columns.map((chapter) => (
                    <th
                      key={chapter.id}
                      scope="col"
                      className="border-b border-r border-sw-border-default bg-sw-bg-raised px-2 py-2 text-center text-[11px] font-semibold leading-tight text-sw-text-muted"
                    >
                      {chapter.chapterNum}화
                      {chapter.title && (
                        <span className="block font-normal text-sw-text-dim">
                          {chapter.title}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Summary row */}
                <tr>
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r border-sw-border-default bg-sw-bg-elevated px-4 py-2.5 text-left text-xs font-bold text-sw-link"
                  >
                    {PLOT_THREAD_COPY.summaryRowLabel}
                  </th>
                  {columns.map((chapter) => (
                    <td
                      key={chapter.id}
                      className="border-b border-r border-sw-border-default px-2 py-2 text-center"
                    >
                      {renderCellButton(
                        SUMMARY_ROW_KEY,
                        PLOT_THREAD_COPY.summaryRowLabel,
                        chapter,
                        cellFor(matrix.summaryRow.cells, chapter.id)
                      )}
                    </td>
                  ))}
                </tr>
                {/* Card rows */}
                {matrix.rows.map((row) => (
                  <tr key={row.blockId}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 border-b border-r border-sw-border-default bg-sw-bg-surface px-4 py-2.5 text-left text-xs font-semibold text-sw-text-primary"
                    >
                      {row.title}
                      <span className="block text-[10px] font-normal text-sw-text-dim">
                        {row.pathLabel}
                      </span>
                    </th>
                    {columns.map((chapter) => (
                      <td
                        key={chapter.id}
                        className="border-b border-r border-sw-border-default px-2 py-2 text-center"
                      >
                        {renderCellButton(
                          row.blockId,
                          row.title,
                          chapter,
                          cellFor(row.cells, chapter.id)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile fallback — per-chapter list, no horizontal scroll required */}
          <ul className="divide-y divide-sw-border-default md:hidden">
            {columns.map((chapter) => {
              const summaryCell = cellFor(matrix.summaryRow.cells, chapter.id);
              const rowHits = matrix.rows
                .map((row) => ({ row, cell: cellFor(row.cells, chapter.id) }))
                .filter((x) => x.cell && x.cell.signal !== "empty");
              const showSummary = summaryCell && summaryCell.signal !== "empty";
              if (!showSummary && rowHits.length === 0) return null;
              return (
                <li key={chapter.id} className="px-4 py-3">
                  <p className="text-xs font-bold text-sw-text-primary">
                    {chapterColLabel(chapter)}
                  </p>
                  <div className="mt-2 flex flex-col gap-2">
                    {showSummary && summaryCell && (
                      <div className="flex items-center gap-2">
                        {renderCellButton(
                          SUMMARY_ROW_KEY,
                          PLOT_THREAD_COPY.summaryRowLabel,
                          chapter,
                          summaryCell
                        )}
                        <span className="text-xs text-sw-link">
                          {PLOT_THREAD_COPY.summaryRowLabel}
                        </span>
                      </div>
                    )}
                    {rowHits.map(({ row, cell }) => (
                      <div key={row.blockId} className="flex items-center gap-2">
                        {renderCellButton(row.blockId, row.title, chapter, cell)}
                        <span className="text-xs text-sw-text-secondary">
                          {row.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {!hasRows && (
        <p className="border-t border-sw-border-default px-4 py-4 text-sm text-sw-text-muted">
          {PLOT_THREAD_COPY.emptyLinks}
        </p>
      )}
    </section>
  );
}
