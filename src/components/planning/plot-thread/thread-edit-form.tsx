"use client";

import { Check } from "lucide-react";

export function ThreadEditForm({
  title,
  onTitleChange,
  summary,
  onSummaryChange,
  onSubmit,
  disabled,
}: {
  title: string;
  onTitleChange: (v: string) => void;
  summary: string;
  onSummaryChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-lg border border-sw-border-default bg-sw-bg-surface p-4">
      <h4 className="text-xs font-bold text-sw-text-secondary">
        스레드 정보 편집
      </h4>
      <form
        className="mt-2 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <label
          htmlFor="edit-plot-thread-title"
          className="text-[11px] font-bold text-sw-text-muted"
        >
          제목
        </label>
        <input
          id="edit-plot-thread-title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          maxLength={120}
          className="min-h-9 rounded-md border border-sw-border-default bg-sw-bg-elevated px-2 text-sm text-sw-text-primary"
        />
        <label
          htmlFor="edit-plot-thread-summary"
          className="text-[11px] font-bold text-sw-text-muted"
        >
          간단한 설명 (선택)
        </label>
        <textarea
          id="edit-plot-thread-summary"
          value={summary}
          onChange={(e) => onSummaryChange(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder="이 스레드의 범위를 한두 줄로 적습니다."
          className="rounded-md border border-sw-border-default bg-sw-bg-elevated px-2 py-1.5 text-xs text-sw-text-primary"
        />
        <button
          type="submit"
          disabled={disabled || title.trim().length === 0}
          className="inline-flex min-h-9 w-max items-center gap-1 rounded-md border border-sw-accent-border bg-sw-accent-bg px-3 text-xs font-bold text-sw-accent disabled:opacity-50"
        >
          <Check className="size-3.5" />
          제목·설명 저장
        </button>
      </form>
    </section>
  );
}
