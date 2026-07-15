import { DetailSection } from "@/components/codex-detail-panel/detail-section";
import type { CodexEvidence } from "@/components/codex-detail-panel/types";

interface EvidenceSectionProps {
  evidence: CodexEvidence[];
  color: string;
}

export function EvidenceSection({ evidence, color }: EvidenceSectionProps) {
  if (evidence.length === 0) {
    return (
      <DetailSection title="회차별 기록" titleSuffix="원문 근거">
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--sw-text-dim)" }}>
          아직 원문 근거가 연결된 저장 기록이 없습니다.
        </p>
      </DetailSection>
    );
  }

  return (
    <DetailSection title="회차별 기록" titleSuffix="원문 근거">
      <div className="flex flex-col gap-2">
        {evidence.slice(0, 8).map((item) => {
          const isAlias = item.suggestedAction === "MERGE";
          return (
            <div
              key={item.id}
              className="rounded-md px-3 py-2"
              style={{
                background: "var(--sw-bg-elevated)",
                border: "1px solid var(--sw-border-muted)",
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold" style={{ color }}>
                  {item.chapterNum}화
                </span>
                <span
                  className="text-[10px] px-[6px] py-[1px] rounded-[3px]"
                  style={{
                    background: isAlias ? "var(--sw-bg-active)" : "var(--sw-bg-raised)",
                    color: isAlias ? "var(--sw-accent)" : "var(--sw-text-muted)",
                    border: isAlias ? "1px solid var(--sw-border-focus)" : "1px solid var(--sw-border-muted)",
                  }}
                >
                  {isAlias ? "별칭/호칭 저장" : "항목 저장"}
                </span>
              </div>
              <div className="mt-1 text-[12px] font-semibold" style={{ color: "var(--sw-text-primary)" }}>
                {item.name}
              </div>
              {item.contextSnippet ? (
                <p className="mt-1 text-[11px] leading-[1.55]" style={{ color: "var(--sw-text-muted)" }}>
                  &lsquo;{item.contextSnippet}&rsquo;
                </p>
              ) : (
                <p className="mt-1 text-[11px] leading-[1.55]" style={{ color: "var(--sw-text-dim)" }}>
                  원문 근거가 저장되지 않은 이전 기록입니다.
                </p>
              )}
            </div>
          );
        })}
        {evidence.length > 8 && (
          <p className="text-[10.5px]" style={{ color: "var(--sw-text-dim)" }}>
            최근 화면에는 {8}개까지만 표시합니다. 전체 기록은 이후 히스토리 화면에서 확장합니다.
          </p>
        )}
      </div>
    </DetailSection>
  );
}
