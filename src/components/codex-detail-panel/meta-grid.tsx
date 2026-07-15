import { DetailSection } from "@/components/codex-detail-panel/detail-section";

interface MetaGridProps {
  firstChapter: number | null;
  relationCount: number;
  statusLabel: string;
  statusColor: string;
  chapterCount: number;
}

export function MetaGrid({
  firstChapter,
  relationCount,
  statusLabel,
  statusColor,
  chapterCount,
}: MetaGridProps) {
  return (
    <DetailSection>
      <div className="grid grid-cols-2 gap-2">
        <MetaItem label="첫 등장" value={firstChapter != null ? `${firstChapter}` : "—"} suffix="화" />
        <MetaItem label="관계 수" value={`${relationCount}`} />
        <MetaItem label="상태" value={statusLabel} valueColor={statusColor} small />
        <MetaItem label="등장 빈도" value={`${chapterCount}`} suffix="회" />
      </div>
    </DetailSection>
  );
}

function MetaItem({
  label,
  value,
  suffix,
  valueColor,
  small,
}: {
  label: string;
  value: string;
  suffix?: string;
  valueColor?: string;
  small?: boolean;
}) {
  return (
    <div
      className="rounded-md px-[11px] py-[9px]"
      style={{ background: "var(--sw-bg-elevated)" }}
    >
      <div
        className="text-[10px] mb-[2px]"
        style={{ color: "var(--sw-text-dim)" }}
      >
        {label}
      </div>
      <div
        className={`font-semibold font-mono ${small ? "text-[12px]" : "text-[13.5px]"}`}
        style={{ color: valueColor }}
      >
        {value}
        {suffix && (
          <span
            className="text-[10px] font-normal ml-[1px]"
            style={{ color: "var(--sw-text-dim)" }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
