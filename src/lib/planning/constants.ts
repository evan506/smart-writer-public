import type {
  PlanningBlockKind,
  PlanningBlockStatus,
  PlanningStructureKey,
} from "@/types";

export const DEFAULT_PLANNING_BLOCKS: ReadonlyArray<{
  structureKey: PlanningStructureKey;
  title: string;
  position: number;
}> = [
  { structureKey: "START", title: "시작", position: 0 },
  { structureKey: "DEVELOPMENT", title: "전개", position: 1 },
  { structureKey: "TURN", title: "전환", position: 2 },
  { structureKey: "ENDING", title: "결말", position: 3 },
];

export const PLANNING_STATUS_LABELS: Record<PlanningBlockStatus, string> = {
  PLANNED: "계획만 있음",
  EXPANDED: "구체화됨",
  NEEDS_DETAIL: "상세 필요",
  MANUSCRIPT_SEEN: "원고 등장",
  MEMORY_LINKED: "기억 연결",
  NEEDS_REVIEW: "확인 필요",
};

export const PLANNING_STATUS_VARIANTS: Record<
  PlanningBlockStatus,
  "neutral" | "accent" | "success" | "warn"
> = {
  PLANNED: "neutral",
  EXPANDED: "accent",
  NEEDS_DETAIL: "warn",
  MANUSCRIPT_SEEN: "accent",
  MEMORY_LINKED: "success",
  NEEDS_REVIEW: "warn",
};

export const PLANNING_CHILD_KIND_LABELS: Record<
  Exclude<PlanningBlockKind, "ROOT">,
  string
> = {
  EPISODE: "에피소드",
  CHAPTER: "화",
  SCENE: "장면",
  EVENT: "사건",
  PROMISE: "작품 약속",
  CHARACTER_PLAN: "인물 계획",
  PLACE_PLAN: "장소 계획",
};

export const PLANNING_CHILD_KIND_OPTIONS: ReadonlyArray<{
  kind: Exclude<PlanningBlockKind, "ROOT">;
  label: string;
}> = [
  { kind: "EPISODE", label: PLANNING_CHILD_KIND_LABELS.EPISODE },
  { kind: "CHAPTER", label: PLANNING_CHILD_KIND_LABELS.CHAPTER },
  { kind: "SCENE", label: PLANNING_CHILD_KIND_LABELS.SCENE },
  { kind: "EVENT", label: PLANNING_CHILD_KIND_LABELS.EVENT },
  { kind: "PROMISE", label: PLANNING_CHILD_KIND_LABELS.PROMISE },
  { kind: "CHARACTER_PLAN", label: PLANNING_CHILD_KIND_LABELS.CHARACTER_PLAN },
  { kind: "PLACE_PLAN", label: PLANNING_CHILD_KIND_LABELS.PLACE_PLAN },
];
