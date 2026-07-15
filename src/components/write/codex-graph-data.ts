import type { GraphLink, GraphNode } from "./codex-graph-types";

export function getSelectedNeighborIds(
  links: GraphLink[],
  selectedEntityId?: string | null
) {
  if (!selectedEntityId) return new Set<string>();

  const ids = new Set<string>([selectedEntityId]);
  for (const link of links) {
    if (link.source === selectedEntityId) ids.add(link.target);
    if (link.target === selectedEntityId) ids.add(link.source);
  }

  return ids;
}

export function getVisibleGraphData({
  nodes,
  links,
  selectedEntityId,
  showNeighborsOnly,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  selectedEntityId?: string | null;
  showNeighborsOnly: boolean;
}) {
  const selectedNeighborIds = getSelectedNeighborIds(links, selectedEntityId);
  const visibleNodes =
    showNeighborsOnly && selectedEntityId
      ? nodes.filter((node) => selectedNeighborIds.has(node.id))
      : nodes;
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleLinks = links.filter(
    (link) => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target)
  );

  return { visibleNodes, visibleLinks };
}
