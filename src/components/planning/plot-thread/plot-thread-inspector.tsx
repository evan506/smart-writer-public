"use client";

import Link from "next/link";
import { ArrowUpRight, BookOpen, ExternalLink, Layers3 } from "lucide-react";
import type { SelectedCell } from "./plot-thread-matrix";
import {
  PLOT_THREAD_COPY,
  PLOT_THREAD_SIGNAL_LABELS,
} from "@/lib/planning/plot-thread-constants";

interface PlotThreadInspectorProps {
  projectId: string;
  threadTitle: string;
  selected: SelectedCell | null;
  onSwitchToTree: () => void;
}

export function PlotThreadInspector({
  projectId,
  threadTitle,
  selected,
  onSwitchToTree,
}: PlotThreadInspectorProps) {
  if (!selected) {
    return (
      <section className="rounded-lg border border-sw-border-default bg-sw-bg-surface p-4">
        <p className="text-xs font-bold text-sw-accent">EVIDENCE INSPECTOR</p>
        <h3 className="mt-1 text-base font-bold">선택한 연결</h3>
        <p className="mt-2 text-sm leading-6 text-sw-text-muted">
          매트릭스에서 칸을 선택하면 원문 근거와 연결 출처를 확인할 수 있습니다.
        </p>
      </section>
    );
  }

  const { rowLabel, chapter, cell } = selected;
  const manualSources = cell.manualSources;
  const evidenceSources = cell.evidenceSources;
  const isEmpty = cell.signal === "empty";

  return (
    <section className="rounded-lg border border-sw-border-default bg-sw-bg-surface p-4">
      <p className="text-xs font-bold text-sw-accent">EVIDENCE INSPECTOR</p>
      <span
        className={`mt-2 inline-flex w-max items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
          cell.evidence
            ? "bg-sw-accent-bg text-sw-accent"
            : cell.manual
              ? "bg-sw-link-soft text-sw-link"
              : "bg-sw-bg-elevated text-sw-text-muted"
        }`}
      >
        {PLOT_THREAD_SIGNAL_LABELS[cell.signal]}
      </span>
      <h3 className="mt-2 text-base font-bold leading-snug">
        {chapter.chapterNum}화
        {chapter.title ? ` · ${chapter.title}` : ""}
      </h3>
      <p className="mt-1 text-xs leading-5 text-sw-text-muted">
        {threadTitle} · {rowLabel}
      </p>

      {isEmpty && (
        <p className="mt-3 rounded-md border border-sw-border-default bg-sw-bg-elevated px-3 py-2 text-xs leading-5 text-sw-text-muted">
          {PLOT_THREAD_COPY.emptyEvidenceCell}
        </p>
      )}

      {manualSources.length > 0 && (
        <div className="mt-3 border-t border-sw-border-default pt-3">
          <h4 className="text-xs font-bold text-sw-link">작가 연결</h4>
          <ul className="mt-2 flex flex-col gap-1.5">
            {manualSources.map((source, index) => (
              <li
                key={`${source.kind}-${source.blockId ?? "thread"}-${index}`}
                className="flex items-center gap-1.5 text-xs text-sw-text-secondary"
              >
                <ArrowUpRight className="size-3.5 text-sw-link" />
                {source.kind === "thread_chapter"
                  ? "스레드에 회차 직접 연결"
                  : `구상 카드 연결: ${source.blockTitle ?? "구상 카드"}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {evidenceSources.length > 0 && (
        <div className="mt-3 border-t border-sw-border-default pt-3">
          <h4 className="text-xs font-bold text-sw-accent">원문 근거 · 작품 기억</h4>
          <ul className="mt-2 flex flex-col gap-2">
            {evidenceSources.map((source, index) => (
              <li
                key={`${source.kind}-${source.entityId}-${index}`}
                className="rounded-md border-l-2 border-sw-accent bg-sw-accent-bg px-3 py-2"
              >
                <p className="text-[11px] font-bold text-sw-accent">
                  {source.entityName}
                  {source.kind === "fact_source" && source.factValue
                    ? ` · ${source.factValue}`
                    : ""}
                </p>
                {source.excerpt && (
                  <p className="mt-1 text-xs leading-5 text-sw-text-secondary">
                    “{source.excerpt}”
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-2 border-t border-sw-border-default pt-3">
        <Link
          href={`/projects/${projectId}/write?chapter=${chapter.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-sw-accent hover:underline"
        >
          <BookOpen className="size-3.5" />
          원고 회차로 이동
        </Link>
        <Link
          href={`/projects/${projectId}/codex`}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-sw-accent hover:underline"
        >
          <ExternalLink className="size-3.5" />
          작품 기억(Codex) 열기
        </Link>
        <button
          type="button"
          onClick={onSwitchToTree}
          className="inline-flex w-max items-center gap-1.5 text-xs font-bold text-sw-text-muted hover:text-sw-accent"
        >
          <Layers3 className="size-3.5" />
          구상 트리에서 보기
        </button>
      </div>
    </section>
  );
}
