import { getColor, RELATION_TYPE_LABELS } from "@/components/codex-detail-panel/constants";
import { DetailSection } from "@/components/codex-detail-panel/detail-section";
import type { RelationItem } from "@/components/codex-detail-panel/types";

interface RelationListProps {
  relations: RelationItem[];
  color: string;
  onEntityClick: (entityId: string) => void;
}

export function RelationList({ relations, color, onEntityClick }: RelationListProps) {
  if (relations.length === 0) return null;

  return (
    <DetailSection title="관계 목록" titleSuffix="원문 근거">
      <div className="flex flex-col gap-2">
        {relations.map((rel) => (
          <div
            key={rel.id}
            className="rounded-md px-2 py-2"
            style={{
              background: "var(--sw-bg-elevated)",
              border: "1px solid var(--sw-border-muted)",
            }}
          >
            <button
              onClick={() => onEntityClick(rel.id)}
              className="flex w-full items-center gap-2 rounded-md transition-colors cursor-pointer text-left hover:bg-white/[0.03]"
            >
              <span
                className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                style={{ background: getColor(rel.type) }}
              />
              <span className="text-[12.5px] font-medium flex-1" style={{ color: "var(--sw-text-primary)" }}>
                {rel.name}
              </span>
              <span
                className="text-[10px] px-[6px] py-[1px] rounded-[3px] font-mono"
                style={{
                  background: "var(--sw-bg-raised)",
                  color: "var(--sw-text-dim)",
                }}
              >
                {RELATION_TYPE_LABELS[rel.relationType] ?? rel.relationType}
              </span>
              <span
                className="text-[10px] font-mono"
                style={{ color: "var(--sw-text-dim)" }}
              >
                {rel.weight.toFixed(1)}
              </span>
            </button>
            {rel.evidence.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1.5">
                {rel.evidence.slice(0, 2).map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md px-2 py-1.5"
                    style={{
                      background: "var(--sw-bg-raised)",
                      border: "1px solid var(--sw-border-muted)",
                    }}
                  >
                    <div className="text-[10px] font-bold" style={{ color }}>
                      {item.chapterNum}화 관계 근거
                    </div>
                    {item.contextSnippet ? (
                      <p className="mt-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--sw-text-muted)" }}>
                        &lsquo;{item.contextSnippet}&rsquo;
                      </p>
                    ) : (
                      <p className="mt-1 text-[10.5px] leading-[1.5]" style={{ color: "var(--sw-text-dim)" }}>
                        원문 근거가 저장되지 않은 이전 관계 기록입니다.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[10.5px] leading-[1.45]" style={{ color: "var(--sw-text-dim)" }}>
                이 관계에는 아직 원문 근거가 연결되어 있지 않습니다.
              </p>
            )}
          </div>
        ))}
      </div>
    </DetailSection>
  );
}
