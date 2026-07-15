import { getColor, RELATION_TYPE_LABELS } from "@/components/codex-detail-panel/constants";
import type { CodexEntity, CodexLink } from "@/components/codex-detail-panel/types";

interface MiniGraphProps {
  centerEntity: CodexEntity;
  links: CodexLink[];
  allEntities: CodexEntity[];
}

export function MiniGraph({ centerEntity, links, allEntities }: MiniGraphProps) {
  const entityMap = new Map(allEntities.map((e) => [e.id, e]));
  const MAX_NODES = 6;

  const relatedMap = new Map<string, { name: string; type: string; relationType: string }>();
  for (const link of links) {
    const otherId = link.from_id === centerEntity.id ? link.to_id : link.from_id;
    const otherName = link.from_id === centerEntity.id ? link.to_name : link.from_name;
    if (!relatedMap.has(otherId)) {
      const otherEntity = entityMap.get(otherId);
      relatedMap.set(otherId, {
        name: otherName,
        type: otherEntity?.type ?? "CONCEPT",
        relationType: link.relation_type,
      });
    }
  }

  const related = Array.from(relatedMap.values()).slice(0, MAX_NODES);
  if (related.length === 0) {
    return (
      <div
        className="rounded-[10px] flex items-center justify-center text-[11px]"
        style={{
          background: "var(--sw-bg-elevated)",
          color: "var(--sw-text-dim)",
          height: 120,
        }}
      >
        연결된 관계가 없습니다
      </div>
    );
  }

  const cx = 160;
  const cy = 80;
  const radius = 60;
  const centerColor = getColor(centerEntity.type);

  return (
    <div
      className="rounded-[10px] relative overflow-hidden"
      style={{
        background: "var(--sw-bg-elevated)",
        height: 190,
        padding: 14,
      }}
    >
      <svg viewBox="0 0 320 160" className="w-full h-full">
        {related.map((r, i) => {
          const angle = (2 * Math.PI * i) / related.length - Math.PI / 2;
          const nx = cx + radius * Math.cos(angle);
          const ny = cy + radius * Math.sin(angle);
          const mx = (cx + nx) / 2;
          const my = (cy + ny) / 2;
          return (
            <g key={`edge-${i}`}>
              <line
                x1={cx}
                y1={cy}
                x2={nx}
                y2={ny}
                stroke="var(--sw-border-default)"
                strokeWidth={1.5}
              />
              <text
                x={mx}
                y={my - 4}
                textAnchor="middle"
                style={{
                  fontSize: "8.5px",
                  fill: "var(--sw-text-dim)",
                  fontFamily: "'Noto Sans KR', sans-serif",
                }}
              >
                {RELATION_TYPE_LABELS[r.relationType] ?? r.relationType.toLowerCase().replace(/_/g, " ")}
              </text>
            </g>
          );
        })}

        <g>
          <circle cx={cx} cy={cy} r={24} fill={`${centerColor}15`} stroke={centerColor} strokeWidth={2} />
          <text
            x={cx}
            y={cy}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fontSize: "11px",
              fontWeight: 600,
              fill: "var(--sw-text-primary)",
              fontFamily: "'Noto Sans KR', sans-serif",
              pointerEvents: "none",
            }}
          >
            {centerEntity.name.length > 4
              ? centerEntity.name.slice(0, 4) + "…"
              : centerEntity.name}
          </text>
        </g>

        {related.map((r, i) => {
          const angle = (2 * Math.PI * i) / related.length - Math.PI / 2;
          const nx = cx + radius * Math.cos(angle);
          const ny = cy + radius * Math.sin(angle);
          const nodeColor = getColor(r.type);
          return (
            <g key={`node-${i}`}>
              <circle
                cx={nx}
                cy={ny}
                r={18}
                fill={`${nodeColor}14`}
                stroke={`${nodeColor}66`}
                strokeWidth={1.5}
              />
              <text
                x={nx}
                y={ny}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fontSize: r.name.length > 3 ? "8.5px" : "9.5px",
                  fontWeight: 500,
                  fill: "var(--sw-text-primary)",
                  fontFamily: "'Noto Sans KR', sans-serif",
                  pointerEvents: "none",
                }}
              >
                {r.name.length > 5 ? r.name.slice(0, 5) + "…" : r.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        className="absolute bottom-2 right-3 text-[9.5px]"
        style={{ color: "var(--sw-text-dim)", opacity: 0.75 }}
      >
        직접 연결 · 상위 {related.length}개
      </div>
    </div>
  );
}
