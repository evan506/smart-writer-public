import { X } from "lucide-react";
import { DetailSection } from "@/components/codex-detail-panel/detail-section";

interface AliasesSectionProps {
  aliases: string[];
  isPending: boolean;
  /** Omitted for candidates: removal resolves the id against `entities`, and a
   *  candidate's id is an `entity_suggestions` row. */
  onRemoveAlias?: (alias: string) => void;
}

export function AliasesSection({
  aliases,
  isPending,
  onRemoveAlias,
}: AliasesSectionProps) {
  if (aliases.length === 0) return null;

  const removable = Boolean(onRemoveAlias);

  return (
    <DetailSection title="별칭/호칭" titleSuffix={removable ? "작가가 저장한 표현" : "후보 단계"}>
      <div className="flex gap-[5px] flex-wrap">
        {aliases.map((alias) => (
          <span
            key={alias}
            className="inline-flex items-center gap-[5px] px-[9px] py-[2px] rounded-md text-[12px]"
            style={{
              background: "var(--sw-bg-raised)",
              border: "1px solid var(--sw-border-muted)",
              color: "var(--sw-text-muted)",
            }}
          >
            {alias}
            {onRemoveAlias && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemoveAlias(alias);
                }}
                disabled={isPending}
                className="inline-flex items-center justify-center rounded-sm cursor-pointer disabled:opacity-40"
                style={{
                  width: 14,
                  height: 14,
                  background: "var(--sw-bg-elevated)",
                  border: "1px solid var(--sw-border-muted)",
                  color: "var(--sw-text-dim)",
                }}
                title={`${alias} 별칭/호칭 제거`}
                aria-label={`${alias} 별칭/호칭 제거`}
              >
                <X size={9} />
              </button>
            )}
          </span>
        ))}
      </div>
      {removable && (
        <p className="text-[10.5px] leading-[1.5] mt-2" style={{ color: "var(--sw-text-dim)" }}>
          작가 의도와 맞지 않는 별칭/호칭은 여기서 바로 제거할 수 있습니다.
        </p>
      )}
    </DetailSection>
  );
}
