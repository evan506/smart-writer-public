"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getVisibleGraphData } from "./codex-graph-data";
import { CodexGraphControls } from "./codex-graph-controls";
import { renderCodexForceGraph } from "./codex-graph-renderer";
import { CodexGraphTooltip } from "./codex-graph-tooltip";
import type {
  GraphLink,
  GraphNode,
  GraphViewCommand,
  TooltipData,
} from "./codex-graph-types";

export type { GraphLink, GraphNode, GraphViewCommand } from "./codex-graph-types";

export function CodexForceGraph({
  nodes,
  links,
  selectedEntityId,
  onNodeSelect,
  viewCommand,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedEntityId?: string | null;
  onNodeSelect?: (entityId: string) => void;
  viewCommand?: { type: GraphViewCommand; nonce: number } | null;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const fitViewRef = useRef<(() => void) | null>(null);
  const resetViewRef = useRef<(() => void) | null>(null);
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const [showNeighborsOnly, setShowNeighborsOnly] = useState(false);

  const { visibleNodes, visibleLinks } = useMemo(
    () =>
      getVisibleGraphData({
        nodes,
        links,
        selectedEntityId,
        showNeighborsOnly,
      }),
    [links, nodes, selectedEntityId, showNeighborsOnly]
  );

  useEffect(() => {
    if (!selectedEntityId) {
      setShowNeighborsOnly(false);
    }
  }, [selectedEntityId]);

  useEffect(() => {
    if (!viewCommand) return;
    if (viewCommand.type === "fit") fitViewRef.current?.();
    if (viewCommand.type === "reset") resetViewRef.current?.();
  }, [viewCommand]);

  useEffect(() => {
    if (!svgRef.current) return;

    return renderCodexForceGraph({
      svgElement: svgRef.current,
      nodes: visibleNodes,
      links: visibleLinks,
      allLinks: links,
      selectedEntityId,
      onNodeSelect,
      onTooltipChange: setTooltip,
      onViewHandlersChange: ({ fitView, resetView }) => {
        fitViewRef.current = fitView;
        resetViewRef.current = resetView;
      },
    });
  }, [links, onNodeSelect, selectedEntityId, visibleLinks, visibleNodes]);

  return (
    <div className="relative w-full h-full">
      <CodexGraphControls
        showNeighborsOnly={showNeighborsOnly}
        selectedEntityId={selectedEntityId}
        onToggleNeighborsOnly={() => setShowNeighborsOnly((value) => !value)}
      />

      <svg
        ref={svgRef}
        className="w-full h-full"
        style={{ background: "transparent" }}
      />

      {visibleNodes.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-sw-text-muted">
          필터에 맞는 항목이 없습니다.
        </div>
      )}

      {tooltip && <CodexGraphTooltip tooltip={tooltip} nodes={nodes} />}
    </div>
  );
}
