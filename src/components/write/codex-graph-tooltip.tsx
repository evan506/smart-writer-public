"use client";

import {
  RELATION_COLORS,
  RELATION_TYPE_LABELS,
  getEntityTypeConfig,
} from "@/lib/design-tokens";
import type { GraphNode, TooltipData } from "./codex-graph-types";

export function CodexGraphTooltip({
  tooltip,
  nodes,
}: {
  tooltip: TooltipData;
  nodes: GraphNode[];
}) {
  const cfg = getEntityTypeConfig(tooltip.node.type);

  return (
    <div
      className="absolute z-50 sw-glass rounded-xl p-3 max-w-[220px] pointer-events-none"
      style={{
        left: tooltip.x + 12,
        top: tooltip.y - 10,
      }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-base">{cfg.icon}</span>
        <span className="font-black text-[13px] text-sw-text-primary truncate">
          {tooltip.node.name}
        </span>
      </div>
      <div
        className="text-[10px] font-extrabold rounded-md px-1.5 py-0.5 inline-block mb-2"
        style={{ color: cfg.color, background: cfg.accent }}
      >
        {cfg.label}
      </div>
      {tooltip.node.summary && (
        <p className="text-[11px] text-sw-text-muted leading-relaxed mb-2 line-clamp-3">
          {tooltip.node.summary}
        </p>
      )}
      {tooltip.links.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] font-extrabold uppercase tracking-wider text-sw-text-dim mb-1">
            관계
          </div>
          {tooltip.links.slice(0, 4).map((link, index) => {
            const relColor = RELATION_COLORS[link.type] ?? "var(--sw-text-muted)";
            const otherName =
              link.source === tooltip.node.id
                ? nodes.find((node) => node.id === link.target)?.name
                : nodes.find((node) => node.id === link.source)?.name;

            return (
              <div key={index} className="flex items-center gap-1.5">
                <span
                  className="rounded px-1 py-0.5 text-[9px] font-extrabold shrink-0"
                  style={{ color: relColor, background: relColor + "20" }}
                >
                  {RELATION_TYPE_LABELS[link.type] ?? link.type}
                </span>
                <span className="text-[11px] text-sw-text-secondary truncate">
                  {otherName}
                </span>
              </div>
            );
          })}
          {tooltip.links.length > 4 && (
            <div className="text-[10px] text-sw-text-ghost">
              +{tooltip.links.length - 4}개 더
            </div>
          )}
        </div>
      )}
    </div>
  );
}
