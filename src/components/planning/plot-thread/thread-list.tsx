"use client";

import type { PlotThreadSummary } from "@/lib/services/plot-thread/read.service";
import { PLOT_THREAD_COPY } from "@/lib/planning/plot-thread-constants";

export function ThreadList({
  threads,
  selectedThreadId,
  onSelect,
}: {
  threads: PlotThreadSummary[];
  selectedThreadId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="rounded-lg border border-sw-border-default bg-sw-bg-surface">
      <div className="border-b border-sw-border-default px-4 py-3">
        <p className="text-xs font-bold text-sw-accent">AUTHOR-DEFINED</p>
        <h3 className="mt-1 text-base font-bold">{PLOT_THREAD_COPY.sectionEyebrow}</h3>
        <p className="mt-1 text-xs leading-5 text-sw-text-muted">
          작가가 이름과 범위를 정합니다. AI가 스레드를 만들지 않습니다.
        </p>
      </div>
      <ul className="flex flex-col gap-1 p-2">
        {threads.map((thread) => (
          <li key={thread.id}>
            <button
              type="button"
              aria-pressed={thread.id === selectedThreadId}
              onClick={() => onSelect(thread.id)}
              className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors ${
                thread.id === selectedThreadId
                  ? "border-sw-accent-border bg-sw-accent-bg"
                  : "border-transparent hover:bg-sw-bg-hover"
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-sw-text-primary">
                  {thread.title}
                </span>
                <span className="rounded-full bg-sw-bg-elevated px-2 py-0.5 text-[11px] font-bold text-sw-text-muted">
                  {thread.connectedChapterCount}회차
                </span>
              </span>
              {thread.summary && (
                <span className="mt-1 block text-[11px] leading-4 text-sw-text-muted">
                  {thread.summary}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
