"use client";

import { Loader2, Plus } from "lucide-react";

interface WriteEmptyChapterStateProps {
  isCreatingFirstChapter: boolean;
  onCreateFirstChapter: () => void;
}

export function WriteEmptyChapterState({
  isCreatingFirstChapter,
  onCreateFirstChapter,
}: WriteEmptyChapterStateProps) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="space-y-4 text-center" style={{ maxWidth: "320px" }}>
        <div
          className="mx-auto flex size-11 items-center justify-center rounded-lg"
          style={{
            background: "var(--sw-bg-active)",
            border: "1px solid var(--sw-border-focus)",
            color: "var(--sw-accent)",
          }}
        >
          <Plus className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: "var(--sw-text-primary)" }}>
            아직 챕터가 없습니다
          </p>
          <p className="text-xs leading-5" style={{ color: "var(--sw-text-muted)" }}>
            첫 챕터를 만들면 바로 제목과 본문을 입력할 수 있습니다.
          </p>
        </div>
        <button
          onClick={onCreateFirstChapter}
          disabled={isCreatingFirstChapter}
          className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-bold transition-opacity disabled:opacity-60"
          style={{
            background: "var(--sw-cta)",
            color: "#fffaf1",
          }}
        >
          {isCreatingFirstChapter ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          첫 챕터 만들기
        </button>
        <p className="text-[11px]" style={{ color: "var(--sw-text-dim)" }}>
          좌측 챕터 영역의 + 버튼으로도 추가할 수 있습니다.
        </p>
      </div>
    </div>
  );
}
