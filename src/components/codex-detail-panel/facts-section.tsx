import { DetailSection } from "@/components/codex-detail-panel/detail-section";
import type { CodexFact, CodexFactSource } from "@/lib/services/canon-facts/read.service";

export const FACT_TYPE_LABELS: Record<string, string> = {
  ATTRIBUTE: "속성",
  ROLE: "역할",
  AFFILIATION: "소속",
  ABILITY: "능력",
  STATE: "상태",
  LOCATION_INFO: "장소 정보",
  RULE: "규칙",
  DESCRIPTION_TEXT: "설명",
};

export function formatFactSourceLabel(source: CodexFactSource): string | null {
  const chapterNum = source.chapterNum;
  if (!chapterNum) return null;
  const chapterTitle = source.chapterTitle;
  if (!chapterTitle) return `${chapterNum}화 근거`;
  return chapterTitle.endsWith("근거")
    ? `${chapterNum}화 · ${chapterTitle}`
    : `${chapterNum}화 · ${chapterTitle} 근거`;
}

export function formatFactFallbackSourceLabel(fact: CodexFact): string | null {
  if (!fact.establishedChapterNum) return null;
  return `${fact.establishedChapterNum}화 근거`;
}

export function FactsSection({ facts }: { facts: CodexFact[] }) {
  if (facts.length === 0) return null;

  return (
    <DetailSection title="승인된 설정" titleSuffix={`${facts.length}개`}>
      <div className="space-y-2">
        {facts.map((fact) => {
          const visibleSources = fact.sources.slice(0, 3);
          const hiddenSourceCount = Math.max(fact.sources.length - visibleSources.length, 0);
          const primarySourceLabel = visibleSources[0]
            ? formatFactSourceLabel(visibleSources[0])
            : formatFactFallbackSourceLabel(fact);
          return (
            <div
              key={fact.id}
              className="rounded-md px-3 py-2"
              style={{
                background: "var(--sw-bg-raised)",
                border: "1px solid var(--sw-border-subtle)",
              }}
            >
              <div className="flex items-start gap-2">
                <span
                  className="shrink-0 rounded-[3px] px-1.5 py-px text-[9.5px] font-semibold"
                  style={{
                    background: "var(--sw-bg-active)",
                    color: "var(--sw-text-muted)",
                  }}
                >
                  {FACT_TYPE_LABELS[fact.factType] ?? fact.factType}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[12.5px] leading-[1.45]"
                    style={{ color: "var(--sw-text-primary)" }}
                  >
                    {fact.value}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {fact.factKey && (
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--sw-text-dim)" }}
                      >
                        {fact.factKey}
                      </span>
                    )}
                    {primarySourceLabel && (
                      <span
                        className="text-[10px]"
                        style={{ color: "var(--sw-text-dim)" }}
                      >
                        {primarySourceLabel}
                        {fact.sources.length > 1 && ` 외 ${fact.sources.length - 1}개`}
                      </span>
                    )}
                  </div>
                  {visibleSources.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {visibleSources.map((source) => (
                        <p
                          key={source.id}
                          className="line-clamp-2 text-[11px] leading-[1.45]"
                          style={{ color: "var(--sw-text-muted)" }}
                        >
                          {formatFactSourceLabel(source) && (
                            <span style={{ color: "var(--sw-text-dim)" }}>
                              {formatFactSourceLabel(source)}:{" "}
                            </span>
                          )}
                          {source.evidenceText ?? "근거 원문 없음"}
                        </p>
                      ))}
                      {hiddenSourceCount > 0 && (
                        <p
                          className="text-[10px]"
                          style={{ color: "var(--sw-text-dim)" }}
                        >
                          근거 {hiddenSourceCount}개 더 있음
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DetailSection>
  );
}
