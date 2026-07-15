"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ragSearch } from "@/app/(dashboard)/projects/[id]/search/actions";
import type { RAGSearchResult, RAGResultItem } from "@/lib/services/rag-search.service";

const MODE_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  graph: { color: "#8b6f9f", bg: "rgba(139, 111, 159, 0.1)", border: "rgba(139, 111, 159, 0.22)" },
  vector: { color: "#6d7f63", bg: "rgba(109, 127, 99, 0.1)", border: "rgba(109, 127, 99, 0.22)" },
  bm25: { color: "var(--sw-accent)", bg: "var(--sw-bg-active)", border: "var(--sw-border-focus)" },
  hybrid: { color: "var(--sw-warning)", bg: "rgba(182, 134, 42, 0.12)", border: "rgba(182, 134, 42, 0.24)" },
};

const SOURCE_COLORS = MODE_COLORS;

const TYPE_LABELS: Record<string, string> = {
  entity: "작품 기억",
  chunk: "본문",
  chapter: "챕터",
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  CHARACTER: "인물",
  PLACE: "장소",
  ITEM: "아이템",
  ORGANIZATION: "조직",
  CONCEPT: "개념",
  MAGIC_SYSTEM: "마법체계",
};

const SOURCE_LABELS: Record<string, string> = {
  graph: "관계",
  vector: "내용",
  bm25: "정확",
  hybrid: "통합",
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(score * 100, 0), 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-20 rounded-full"
        style={{ background: "var(--sw-bg-raised)" }}
      >
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%`, background: "var(--sw-accent)" }}
        />
      </div>
    </div>
  );
}

function SearchBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: { color: string; bg: string; border: string };
}) {
  return (
    <span
      className="inline-flex h-5 items-center rounded px-1.5 text-[10px] font-bold"
      style={{
        background: tone?.bg ?? "var(--sw-bg-raised)",
        border: `1px solid ${tone?.border ?? "var(--sw-border-muted)"}`,
        color: tone?.color ?? "var(--sw-text-muted)",
      }}
    >
      {children}
    </span>
  );
}

function ResultCard({
  item,
  projectId,
}: {
  item: RAGResultItem;
  projectId: string;
}) {
  const href =
    item.type === "entity"
      ? `/projects/${projectId}/codex?entity=${item.id}`
      : item.type === "chapter"
        ? `/projects/${projectId}/write?chapter=${item.id}`
        : null;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        background: "var(--sw-bg-surface)",
        border: "1px solid var(--sw-border-default)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <SearchBadge tone={SOURCE_COLORS[item.source]}>
              {SOURCE_LABELS[item.source] ?? item.source}
            </SearchBadge>
            <SearchBadge>{TYPE_LABELS[item.type]}</SearchBadge>
            {item.metadata?.entityType && (
              <SearchBadge>
                {ENTITY_TYPE_LABELS[item.metadata.entityType] ?? item.metadata.entityType}
              </SearchBadge>
            )}
            {item.metadata?.chapterNum != null && (
              <SearchBadge>Ch.{item.metadata.chapterNum}</SearchBadge>
            )}
          </div>
          <h3 className="truncate text-sm font-bold" style={{ color: "var(--sw-text-primary)" }}>
            {href ? (
              <Link href={href} className="hover:opacity-80">
                {item.title}
              </Link>
            ) : (
              item.title
            )}
          </h3>
          <p className="mt-1 line-clamp-3 text-sm leading-6" style={{ color: "var(--sw-text-muted)" }}>
            {item.content}
          </p>
          {item.metadata?.relationPath && (
            <p className="mt-1 text-xs" style={{ color: "var(--sw-text-ghost)" }}>
              경로: {item.metadata.relationPath}
            </p>
          )}
        </div>
        <ScoreBar score={item.score} />
      </div>
    </div>
  );
}

export function RAGSearchPanel({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<RAGSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"all" | "entity" | "chapter" | "chunk">("all");

  function handleSearch() {
    if (!query.trim()) return;
    startTransition(async () => {
      const res = await ragSearch(projectId, query);
      if (res.error) {
        setError(res.error);
        setResult(null);
      } else {
        setError(null);
        setResult(res.result);
      }
    });
  }

  const filterByType = (type: string) =>
    result?.items.filter((i) => i.type === type) ?? [];

  return (
    <div className="space-y-6">
      {/* Search input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSearch();
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2"
            style={{ color: "var(--sw-text-ghost)" }}
          />
              <input
                placeholder="인물, 장소, 사건, 대사를 작품 안에서 찾아보세요"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 w-full rounded-lg border pl-10 pr-3 text-sm outline-none transition-colors"
            style={{
              background: "var(--sw-bg-surface)",
              borderColor: "var(--sw-border-default)",
              color: "var(--sw-text-primary)",
            }}
          />
        </div>
        <button
          type="submit"
          disabled={isPending || !query.trim()}
          className="inline-flex h-10 min-w-20 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: "var(--sw-cta)",
            color: "#fffaf1",
          }}
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : "검색"}
        </button>
      </form>

      {/* Error */}
      {error && (
        <div
          className="rounded-lg p-3 text-sm"
          style={{
            background: "rgba(163, 90, 69, 0.1)",
            border: "1px solid rgba(163, 90, 69, 0.22)",
            color: "var(--sw-danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {isPending && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full bg-sw-bg-surface" />
          ))}
        </div>
      )}

      {/* Results */}
      {result && !isPending && (
        <>
          {/* Result summary */}
          <div className="flex items-center gap-3 text-sm" style={{ color: "var(--sw-text-muted)" }}>
            <SearchBadge tone={MODE_COLORS.hybrid}>
              작품 검색
            </SearchBadge>
            <span>
              &ldquo;{result.query}&rdquo; 관련 인물, 설정, 본문을 찾았습니다
            </span>
            <span className="ml-auto text-xs" style={{ color: "var(--sw-text-ghost)" }}>
              {result.items.length}건
            </span>
          </div>

          {/* Tabbed results */}
          <div>
            <div
              className="inline-flex rounded-lg p-1"
              style={{
                background: "var(--sw-bg-surface)",
                border: "1px solid var(--sw-border-subtle)",
              }}
            >
              {[
                ["all", `전체 (${result.items.length})`],
                ["entity", `작품 기억 (${filterByType("entity").length})`],
                ["chapter", `챕터 (${filterByType("chapter").length})`],
                ["chunk", `본문 (${filterByType("chunk").length})`],
              ].map(([value, label]) => {
                const active = activeTab === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setActiveTab(value as typeof activeTab)}
                    className="h-7 rounded-md px-3 text-xs font-bold transition-colors"
                    style={{
                      background: active ? "var(--sw-bg-active)" : "transparent",
                      color: active ? "var(--sw-accent)" : "var(--sw-text-muted)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-3">
              {(activeTab === "all" ? result.items : filterByType(activeTab)).length === 0 ? (
                <p className="text-sm" style={{ color: "var(--sw-text-muted)" }}>
                  {activeTab === "all" ? "검색 결과가 없습니다." : `${TYPE_LABELS[activeTab]} 결과가 없습니다.`}
                </p>
              ) : (
                (activeTab === "all" ? result.items : filterByType(activeTab)).map((item) => (
                  <ResultCard
                    key={`${item.source}-${item.id}`}
                    item={item}
                    projectId={projectId}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
