import { DetailSection } from "@/components/codex-detail-panel/detail-section";
import type { CodexForeshadow } from "@/components/codex-detail-panel/types";

interface ForeshadowSectionProps {
  foreshadows: CodexForeshadow[];
  color: string;
}

export function ForeshadowSection({ foreshadows, color }: ForeshadowSectionProps) {
  if (foreshadows.length === 0) return null;

  return (
    <DetailSection title="복선 히스토리" titleSuffix="연결된 항목">
      <div className="flex flex-col gap-2">
        {foreshadows.slice(0, 6).map((item) => (
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
                {item.plantedChapter}화 심음
              </span>
              <span className="text-[10px]" style={{ color: "var(--sw-text-dim)" }}>
                {item.expectedReveal != null ? `${item.expectedReveal}화 회수 예상` : "회수 시점 미정"}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-[1.55]" style={{ color: "var(--sw-text-muted)" }}>
              {item.description ?? "설명 없음"}
            </p>
            {item.status && (
              <span
                className="mt-1 inline-flex text-[10px] px-[6px] py-[1px] rounded-[3px]"
                style={{
                  background: "var(--sw-bg-raised)",
                  color: "var(--sw-text-muted)",
                  border: "1px solid var(--sw-border-muted)",
                }}
              >
                {item.status}
              </span>
            )}
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
