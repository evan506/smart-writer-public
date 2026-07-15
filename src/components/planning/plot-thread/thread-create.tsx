"use client";

import { Plus } from "lucide-react";
import { PLOT_THREAD_COPY } from "@/lib/planning/plot-thread-constants";

export function ThreadCreate({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  disabled: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-lg border border-dashed border-sw-border-hover bg-sw-bg-surface p-3"
    >
      <label
        htmlFor="new-plot-thread"
        className="block text-[11px] font-bold text-sw-text-muted"
      >
        {PLOT_THREAD_COPY.newThread}
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="new-plot-thread"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={120}
          placeholder="예: 황태자 암살 음모"
          className="min-h-9 flex-1 rounded-md border border-sw-border-default bg-sw-bg-elevated px-2 text-sm text-sw-text-primary"
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-sw-accent-border bg-sw-accent-bg px-3 text-xs font-bold text-sw-accent disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          추가
        </button>
      </div>
    </form>
  );
}
