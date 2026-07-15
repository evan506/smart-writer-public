"use client";

import { useState, useTransition } from "react";
import { BookOpenCheck, Loader2 } from "lucide-react";
import { askCanonQuestion } from "@/app/(dashboard)/projects/[id]/search/actions";
import type { CanonQAResult } from "@/lib/services/canon-qna.service";

const STATUS_LABELS: Record<CanonQAResult["status"], string> = {
  answered: "답변 가능",
  partial: "부분 확인",
  insufficient_evidence: "근거 부족",
};

const STATUS_STYLES: Record<
  CanonQAResult["status"],
  { background: string; border: string; color: string }
> = {
  answered: {
    background: "var(--sw-bg-active)",
    border: "1px solid var(--sw-border-focus)",
    color: "var(--sw-accent)",
  },
  partial: {
    background: "rgba(182, 134, 42, 0.12)",
    border: "1px solid rgba(182, 134, 42, 0.28)",
    color: "var(--sw-warning)",
  },
  insufficient_evidence: {
    background: "rgba(163, 90, 69, 0.1)",
    border: "1px solid rgba(163, 90, 69, 0.24)",
    color: "var(--sw-danger)",
  },
};

type CanonQAPanelVariant = "page" | "panel";

const CITATION_TYPE_LABELS: Record<CanonQAResult["citations"][number]["type"], string> = {
  entity: "작품 기억",
  chunk: "원문",
  chapter: "챕터",
};

const CITATION_SOURCE_LABELS: Record<CanonQAResult["citations"][number]["source"], string> = {
  graph: "Codex/Fact",
  vector: "RAG",
  bm25: "검색",
};

function EvidenceCard({
  citation,
  variant = "page",
}: {
  citation: CanonQAResult["citations"][number];
  variant?: CanonQAPanelVariant;
}) {
  const typeLabel = CITATION_TYPE_LABELS[citation.type] ?? citation.type;
  const sourceLabel = CITATION_SOURCE_LABELS[citation.source] ?? citation.source;

  return (
    <div
      className={variant === "panel" ? "rounded-lg p-2.5" : "rounded-lg p-3"}
      style={{
        background: "var(--sw-bg-surface)",
        border: "1px solid var(--sw-border-default)",
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <span
          className="inline-flex h-5 items-center rounded px-1.5 text-[10px] font-bold"
          style={{
            background: "var(--sw-bg-active)",
            color: "var(--sw-accent)",
            border: "1px solid var(--sw-border-focus)",
          }}
        >
          근거 {citation.index}
        </span>
        <span className="text-[11px] font-bold" style={{ color: "var(--sw-accent)" }}>
          {citation.label}
        </span>
        <span
          className="inline-flex h-5 shrink-0 items-center rounded px-1.5 text-[10px] font-bold"
          style={{
            background: "var(--sw-bg-base)",
            color: "var(--sw-text-muted)",
            border: "1px solid var(--sw-border-subtle)",
          }}
          title={`${typeLabel} · ${sourceLabel}`}
        >
          {typeLabel} · {sourceLabel}
        </span>
        <span className="truncate text-xs font-bold" style={{ color: "var(--sw-text-primary)" }}>
          {citation.title}
        </span>
      </div>
      <p className="line-clamp-3 text-xs leading-5" style={{ color: "var(--sw-text-muted)" }}>
        {citation.content}
      </p>
    </div>
  );
}

export function CanonQAPanel({
  projectId,
  variant = "page",
}: {
  projectId: string;
  variant?: CanonQAPanelVariant;
}) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<CanonQAResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isPanel = variant === "panel";

  function handleAsk() {
    if (!question.trim()) return;
    startTransition(async () => {
      const res = await askCanonQuestion(projectId, question);
      if (res.error) {
        setError(res.error);
        setResult(null);
      } else {
        setError(null);
        setResult(res.result);
      }
    });
  }

  return (
    <section
      className={isPanel ? "rounded-lg p-3" : "rounded-xl p-5"}
      style={{
        background: "var(--sw-bg-surface)",
        border: "1px solid var(--sw-border-default)",
      }}
    >
      <div className={isPanel ? "mb-3 flex items-start gap-2.5" : "mb-4 flex items-start gap-3"}>
        <div
          className={isPanel ? "flex size-8 shrink-0 items-center justify-center rounded-lg" : "flex size-9 shrink-0 items-center justify-center rounded-lg"}
          style={{
            background: "var(--sw-bg-active)",
            color: "var(--sw-accent)",
          }}
        >
          <BookOpenCheck className="size-4" />
        </div>
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--sw-text-primary)" }}>
            작품 기억에 질문하기
          </h2>
          <p className={isPanel ? "mt-1 text-[11px] leading-4" : "mt-1 text-xs leading-5"} style={{ color: "var(--sw-text-muted)" }}>
            검색된 Codex와 원문 근거 안에서 확인 가능한 내용만 답변합니다.
          </p>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleAsk();
        }}
        className={isPanel ? "space-y-2" : "flex gap-2"}
      >
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={isPanel ? "확인할 설정을 질문하세요" : "예: 유하린은 왜 흑월단을 떠났나요?"}
          className="h-10 w-full flex-1 rounded-lg border px-3 text-sm outline-none transition-colors"
          style={{
            background: "var(--sw-bg-base)",
            borderColor: "var(--sw-border-default)",
            color: "var(--sw-text-primary)",
          }}
        />
        <button
          type="submit"
          disabled={isPending || !question.trim()}
          className={isPanel ? "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-50" : "inline-flex h-10 min-w-24 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"}
          style={{
            background: "var(--sw-cta)",
            color: "#fffaf1",
          }}
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : "질문"}
        </button>
      </form>

      {error && (
        <div
          className="mt-3 rounded-lg p-3 text-sm"
          style={{
            background: "rgba(163, 90, 69, 0.1)",
            border: "1px solid rgba(163, 90, 69, 0.22)",
            color: "var(--sw-danger)",
          }}
        >
          {error}
        </div>
      )}

      {result && !isPending && (
        <div className={isPanel ? "mt-3 space-y-3" : "mt-4 space-y-4"}>
          <div
            className={isPanel ? "rounded-lg p-3" : "rounded-lg p-4"}
            style={{
              background:
                result.status === "answered"
                  ? "var(--sw-bg-base)"
                  : "rgba(182, 134, 42, 0.1)",
              border:
                result.status === "answered"
                  ? "1px solid var(--sw-border-default)"
                  : "1px solid rgba(182, 134, 42, 0.24)",
            }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span
                className="inline-flex h-5 items-center rounded px-1.5 text-[10px] font-bold"
                style={STATUS_STYLES[result.status]}
              >
                {STATUS_LABELS[result.status]}
              </span>
              <span className="text-[11px]" style={{ color: "var(--sw-text-ghost)" }}>
                확인된 근거 기반
              </span>
            </div>
            <p className={isPanel ? "whitespace-pre-wrap text-xs leading-5" : "whitespace-pre-wrap text-sm leading-6"} style={{ color: "var(--sw-text-primary)" }}>
              {result.answer}
            </p>
          </div>

          {result.citations.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold" style={{ color: "var(--sw-text-muted)" }}>
                사용한 근거
              </h3>
              <p className="mb-2 text-[11px] leading-4" style={{ color: "var(--sw-text-ghost)" }}>
                작품 기억은 승인된 Codex/Fact 근거이고, 원문은 검색된 회차 조각입니다.
              </p>
              <div className={isPanel ? "grid gap-2" : "grid gap-2 md:grid-cols-2"}>
                {result.citations.map((citation) => (
                  <EvidenceCard
                    key={`${citation.source}-${citation.type}-${citation.id}-${citation.index}`}
                    citation={citation}
                    variant={variant}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
