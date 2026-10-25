"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { checkConsistency } from "@/app/(dashboard)/projects/[id]/chapters-actions";
import { zIndex } from "@/lib/design-tokens";
import type { DetectConflictsResult } from "@/types";

interface ConsistencyCheckButtonProps {
  chapterId: string | null;
}

const CHECK_RESULTS: Record<string, { label: string; detail: string }> = {
  MISSING_SUMMARY: {
    label: "설명 미등록",
    detail: "이 회차의 색인에서 언급된 항목에 작품 기억 설명이 없습니다.",
  },
  UNTRACKED_MENTION: {
    label: "언급 기록 누락",
    detail: "원고 색인에 포함된 항목의 언급 기록이 없습니다. 기억 정리 후 다시 확인해 주세요.",
  },
  EXPECTED_ENTITY_ABSENT: {
    label: "이전 등장 항목",
    detail: "이전 회차에서 3회 이상 언급된 항목이 이 회차의 언급 기록에는 없습니다. 의도한 전개라면 조치하지 않아도 됩니다.",
  },
  DANGLING_FORESHADOW: {
    label: "복선 회수 확인",
    detail: "이전 회차에 심은 복선 중 회수 예정이 지났거나 예정 회차가 없는 미회수 복선입니다. 의도한 전개인지 확인해 주세요.",
  },
};

export function ConsistencyCheckButton({ chapterId }: ConsistencyCheckButtonProps) {
  return <ChapterMemoryCheck key={chapterId ?? "no-chapter"} chapterId={chapterId} />;
}

function ChapterMemoryCheck({ chapterId }: ConsistencyCheckButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<DetectConflictsResult[] | null>(null);
  const [open, setOpen] = useState(false);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  const handleCheck = () => {
    if (!chapterId || isPending) return;

    setOpen(false);
    setResult(null);
    startTransition(async () => {
      try {
        const response = await checkConsistency(chapterId);
        if (!active.current) return;
        if (response.error) {
          toast.error(response.error);
          return;
        }
        setResult(response.conflicts);
        setOpen(true);
      } catch {
        if (active.current) {
          toast.error("기억 등록 상태 점검에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        }
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
              기억 등록 상태 점검 결과
            </span>
          </div>

          <p className="mb-2 text-[11px] leading-relaxed" style={{ color: "var(--sw-text-muted)" }}>
            마지막으로 저장·정리된 원고 색인과 등록 정보를 확인합니다. 현재 입력 내용이나 이야기의 의미적 모순을 검사하지 않습니다.
          </p>
          {result.length === 0 ? (
            <p className="text-[11px]" style={{ color: "var(--sw-text-muted)" }}>
              등록 상태에서 확인할 항목이 없습니다
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
                      {CHECK_RESULTS[conflict.conflict_type]?.label ?? "등록 정보 확인"}
                    </span>
                  </div>
                  <p
                    className="text-[10.5px] leading-relaxed"
                    style={{ color: "var(--sw-text-muted)" }}
                  >
                    {CHECK_RESULTS[conflict.conflict_type]?.detail ?? conflict.detail}
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
        title="저장·정리된 원고 색인과 등록 정보를 확인합니다. 이야기의 의미적 모순 검사는 아닙니다."
        onClick={handleCheck}
        disabled={!chapterId || isPending}
        className="flex min-h-11 items-center gap-1 rounded-md px-3 py-1 text-xs xl:min-h-0 xl:py-0.5 xl:text-[10px] font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: "var(--sw-bg-raised)",
          border: "1px solid var(--sw-border-default)",
          color: "var(--sw-text-secondary)",
        }}
      >
        <ShieldCheck className="size-3" />
        {isPending ? "점검 중..." : "기억 등록 상태 점검"}
      </button>
    </div>
  );
}
