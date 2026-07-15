export interface GraphNode {
  id: string;
  name: string;
  type: string;
  summary: string | null;
  importance: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: string;
}

export type GraphViewCommand = "fit" | "reset";

export interface TooltipData {
  x: number;
  y: number;
  node: GraphNode;
  links: GraphLink[];
}
