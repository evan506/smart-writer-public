"use client";

import { useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { checkConsistency } from "@/app/(dashboard)/projects/[id]/chapters-actions";
import { zIndex } from "@/lib/design-tokens";
import type { DetectConflictsResult } from "@/types";

interface ConsistencyCheckButtonProps {
  chapterId: string | null;
}

export function ConsistencyCheckButton({ chapterId }: ConsistencyCheckButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DetectConflictsResult[] | null>(null);
  const [open, setOpen] = useState(false);

  const handleCheck = () => {
    if (!chapterId || isPending) return;

    startTransition(async () => {
      try {
        const response = await checkConsistency(chapterId);
        if (response.error) {
          toast.error(response.error);
          return;
        }
        setResult(response.conflicts);
        setOpen(true);
      } catch {
        toast.error("일관성 검사에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    });
  };

  return (
    <div className="relative flex items-center">
      {open && result && (
        <div
          className="sw-glass absolute bottom-full left-0 mb-2 w-72 rounded-xl p-3"
          style={{ zIndex: zIndex.modal }}
        >
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-[11px] font-bold"
              style={{ color: "var(--sw-text-secondary)" }}
            >
              일관성 검사 결과
            </span>
          </div>

          {result.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--sw-text-muted)" }}>
              발견된 설정 충돌이 없습니다
            </p>
          ) : (
            <ul className="sw-scrollbar max-h-60 space-y-2 overflow-y-auto">
              {result.map((conflict, index) => (
                <li
                  key={`${conflict.entity_id}-${index}`}
                  className="rounded-lg p-2"
                  style={{
                    background: "var(--sw-bg-raised)",
                    border: "1px solid var(--sw-border-default)",
                  }}
                >
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className="text-[11px] font-bold"
                      style={{ color: "var(--sw-text-secondary)" }}
                    >
                      {conflict.entity_name}
                    </span>
                    <span
                      className="rounded px-1 py-0.5 text-[9px] font-extrabold"
                      style={{
                        color: "var(--sw-danger)",
                        border: "1px solid var(--sw-danger)",
                      }}
                    >
                      {conflict.conflict_type}
                    </span>
                  </div>
                  <p
                    className="text-[10.5px] leading-relaxed"
                    style={{ color: "var(--sw-text-muted)" }}
                  >
                    {conflict.detail}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex justify-end">
            <button
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors"
              style={{ color: "var(--sw-text-muted)" }}
            >
              닫기
            </button>
          </div>
        </div>
      )}

      <button
        onClick={handleCheck}
        disabled={!chapterId || isPending}
        className="flex items-center gap-1 rounded-md px-3 py-0.5 text-[10px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "var(--sw-bg-raised)",
          border: "1px solid var(--sw-border-default)",
          color: "var(--sw-text-secondary)",
        }}
      >
        <ShieldCheck className="size-3" />
        {isPending ? "검사 중..." : "일관성 검사"}
      </button>
    </div>
  );
}
