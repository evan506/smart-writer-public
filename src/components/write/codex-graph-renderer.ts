import * as d3 from "d3";
import { RELATION_COLORS, getEntityTypeConfig } from "@/lib/design-tokens";
import type { GraphLink, GraphNode, TooltipData } from "./codex-graph-types";

type SimNode = GraphNode & d3.SimulationNodeDatum;
type SimLink = GraphLink & d3.SimulationLinkDatum<SimNode>;

interface RenderForceGraphOptions {
  svgElement: SVGSVGElement;
  nodes: GraphNode[];
  links: GraphLink[];
  allLinks: GraphLink[];
  selectedEntityId?: string | null;
  onNodeSelect?: (entityId: string) => void;
  onTooltipChange: (tooltip: TooltipData | null) => void;
  onViewHandlersChange: (handlers: {
    fitView: (() => void) | null;
    resetView: (() => void) | null;
  }) => void;
}

export function renderCodexForceGraph({
  svgElement,
  nodes,
  links,
  allLinks,
  selectedEntityId,
  onNodeSelect,
  onTooltipChange,
  onViewHandlersChange,
}: RenderForceGraphOptions) {
  const svg = d3.select(svgElement);
  svg.selectAll("*").remove();

  if (nodes.length === 0) {
    onViewHandlersChange({ fitView: null, resetView: null });
    return () => undefined;
  }

  const width = svgElement.clientWidth || 800;
  const height = svgElement.clientHeight || 600;
  const container = svg.append("g");

  const zoom = d3
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.3, 3])
    .on("zoom", (event) => {
      container.attr("transform", event.transform);
    });
  svg.call(zoom);

  const simNodes: SimNode[] = nodes.map((node) => ({
    ...node,
    x: width / 2,
    y: height / 2,
  }));
  const simLinks: SimLink[] = links.map((link) => ({ ...link }));

  function fitView() {
    if (simNodes.length === 0) return;

    const xs = simNodes.map((node) => node.x ?? 0);
    const ys = simNodes.map((node) => node.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const bboxW = Math.max(maxX - minX, 1);
    const bboxH = Math.max(maxY - minY, 1);
    const padding = 60;
    const scale = Math.min(
      (width - padding * 2) / bboxW,
      (height - padding * 2) / bboxH,
      1
    );
    const tx = width / 2 - scale * (minX + bboxW / 2);
    const ty = height / 2 - scale * (minY + bboxH / 2);

    svg
      .transition()
      .duration(400)
      .call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
  }

  const resetView = () => {
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
  };

  onViewHandlersChange({ fitView, resetView });

  const simulation = d3
    .forceSimulation(simNodes)
    .force(
      "link",
      d3
        .forceLink<SimNode, SimLink>(simLinks)
        .id((node) => node.id)
        .distance(110)
        .strength(0.35)
    )
    .force("charge", d3.forceManyBody().strength(-350))
    .force("collide", d3.forceCollide<SimNode>((node) => 30 + node.importance * 0.3))
    .force("x", d3.forceX<SimNode>(width / 2).strength(0.04))
    .force("y", d3.forceY<SimNode>(height / 2).strength(0.04));

  appendArrowheadMarkers(svg, links);

  const linkEls = container
    .append("g")
    .attr("class", "links")
    .selectAll("line")
    .data(simLinks)
    .enter()
    .append("line")
    .attr("stroke", (link) => RELATION_COLORS[link.type] ?? "#6b6358")
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.6)
    .attr("stroke-dasharray", (link) => (link.type === "ENEMY" ? "5,4" : null))
    .attr("marker-end", (link) => `url(#arrow-${link.type})`);

  const nodeEls = container
    .append("g")
    .attr("class", "nodes")
    .selectAll<SVGGElement, SimNode>("g")
    .data(simNodes)
    .enter()
    .append("g")
    .attr("cursor", "pointer");

  nodeEls
    .append("circle")
    .attr("r", (node) => getNodeRadius(node))
    .attr("fill", (node) => getEntityTypeConfig(node.type).bg)
    .attr("stroke", (node) => getEntityTypeConfig(node.type).color)
    .attr("stroke-width", (node) => (node.id === selectedEntityId ? 3 : 1.5))
    .attr("filter", (node) =>
      node.id === selectedEntityId
        ? "drop-shadow(0 0 8px rgba(79, 140, 92, 0.32))"
        : null
    );

  nodeEls
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .attr("font-size", (node) => Math.max(10, 10 + node.importance * 0.15))
    .text((node) => getEntityTypeConfig(node.type).icon);

  nodeEls
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", (node) => getNodeRadius(node) + 12)
    .attr("fill", "var(--sw-text-primary)")
    .attr("font-size", 10)
    .attr("font-weight", "700")
    .attr("font-family", "'Pretendard', sans-serif")
    .text((node) => (node.name.length > 8 ? node.name.slice(0, 7) + "…" : node.name));

  nodeEls
    .on("mouseover", (_event, node) => {
      const connectedIds = new Set<string>();
      simLinks.forEach((link) => {
        const sourceId = getSimLinkNodeId(link.source);
        const targetId = getSimLinkNodeId(link.target);
        if (sourceId === node.id || targetId === node.id) {
          connectedIds.add(sourceId);
          connectedIds.add(targetId);
        }
      });

      nodeEls.attr("opacity", (candidate) =>
        candidate.id === node.id || connectedIds.has(candidate.id) ? 1 : 0.15
      );
      linkEls.attr("stroke-opacity", (link) => {
        const sourceId = getSimLinkNodeId(link.source);
        const targetId = getSimLinkNodeId(link.target);
        return sourceId === node.id || targetId === node.id ? 0.9 : 0.05;
      });
    })
    .on("mouseout", () => {
      nodeEls.attr("opacity", 1);
      linkEls.attr("stroke-opacity", 0.6);
      onTooltipChange(null);
    })
    .on("click", (event, node) => {
      event.stopPropagation();
      const nodeLinks = allLinks.filter(
        (link) => link.source === node.id || link.target === node.id
      );
      const rect = svgElement.getBoundingClientRect();
      onTooltipChange({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        node,
        links: nodeLinks,
      });
      onNodeSelect?.(node.id);
    });

  const drag = d3
    .drag<SVGGElement, SimNode>()
    .on("start", (event, node) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      node.fx = node.x;
      node.fy = node.y;
    })
    .on("drag", (event, node) => {
      node.fx = event.x;
      node.fy = event.y;
    })
    .on("end", (event, node) => {
      if (!event.active) simulation.alphaTarget(0);
      node.fx = null;
      node.fy = null;
    });

  nodeEls.call(drag);
  svg.on("click", () => onTooltipChange(null));
  simulation.on("end", fitView);
  simulation.on("tick", () => {
    linkEls
      .attr("x1", (link) => getSimLinkNode(link.source).x ?? 0)
      .attr("y1", (link) => getSimLinkNode(link.source).y ?? 0)
      .attr("x2", (link) => getSimLinkNode(link.target).x ?? 0)
      .attr("y2", (link) => getSimLinkNode(link.target).y ?? 0);

    nodeEls.attr(
      "transform",
      (node) => `translate(${node.x ?? 0},${node.y ?? 0})`
    );
  });

  return () => {
    simulation.stop();
    onViewHandlersChange({ fitView: null, resetView: null });
  };
}

function appendArrowheadMarkers(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  links: GraphLink[]
) {
  const defs = svg.append("defs");
  const markerEntries = Array.from(
    new Set([...Object.keys(RELATION_COLORS), ...links.map((link) => link.type)])
  ).map((type) => [type, RELATION_COLORS[type] ?? "#6b6358"] as const);

  markerEntries.forEach(([type, color]) => {
    defs
      .append("marker")
      .attr("id", `arrow-${type}`)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 22)
      .attr("refY", 0)
      .attr("markerWidth", 4)
      .attr("markerHeight", 4)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", color);
  });
}

function getNodeRadius(node: GraphNode) {
  return Math.max(14, 14 + node.importance * 0.4);
}

function getSimLinkNode(node: string | SimNode) {
  return typeof node === "object" ? node : ({ x: 0, y: 0 } as SimNode);
}

function getSimLinkNodeId(node: string | SimNode) {
  return typeof node === "object" ? node.id : node;
}
