import type { Chapter } from "@/types";

export type RightPanelTab = "codex" | "qa" | "suggestions";

export interface WriteWorkspaceProps {
  projectId: string;
  projectName: string;
  projectGenre: string | null;
  initialChapters: Chapter[];
}
