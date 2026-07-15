import type { CodexFact } from "@/lib/services/canon-facts/read.service";
import { PLANNING_CHILD_KIND_LABELS } from "@/lib/planning/constants";
import type { Chapter, PlanningBlock } from "@/types";

export function getPlanningPath(
  block: PlanningBlock,
  blockById: Map<string, PlanningBlock>
) {
  const path: PlanningBlock[] = [];
  let current: PlanningBlock | undefined = block;
  const seen = new Set<string>();

  while (current && !seen.has(current.id)) {
    path.push(current);
    seen.add(current.id);
    current = current.parent_id ? blockById.get(current.parent_id) : undefined;
  }

  return path;
}

export function getChildColumnTitle(parent: PlanningBlock) {
  if (parent.kind === "ROOT") return `${parent.title}의 구체화 카드`;
  if (parent.kind === "EPISODE") return `${parent.title}의 회차`;
  if (parent.kind === "CHAPTER") return `${parent.title}의 세부 카드`;
  return `${parent.title}의 하위 카드`;
}

export function getPlanningKindLabel(block: PlanningBlock) {
  if (block.kind === "ROOT") return `BLOCK ${block.position + 1}`;
  return (
    PLANNING_CHILD_KIND_LABELS[
      block.kind as keyof typeof PLANNING_CHILD_KIND_LABELS
    ] ?? block.kind
  );
}

export function getPathLabel(path: PlanningBlock[]) {
  return path.map((block) => block.title).join(" / ");
}

export function formatChapterTitle(
  chapter: Pick<Chapter, "chapter_num" | "title">
) {
  return `${chapter.chapter_num}화${chapter.title ? ` · ${chapter.title}` : ""}`;
}

export function formatEntityType(type: string) {
  const labels: Record<string, string> = {
    CHARACTER: "인물",
    ORGANIZATION: "조직",
    PLACE: "장소",
    ITEM: "아이템",
    CONCEPT: "개념",
    MAGIC_SYSTEM: "마법 체계",
  };
  return labels[type] ?? type;
}

export function formatCanonFactLabel(fact: CodexFact) {
  return fact.factKey
    ? `${formatCanonFactType(fact.factType)} · ${fact.factKey}`
    : formatCanonFactType(fact.factType);
}

export function formatCanonFactType(type: string) {
  const labels: Record<string, string> = {
    ATTRIBUTE: "속성",
    ROLE: "역할",
    AFFILIATION: "소속",
    ABILITY: "능력",
    STATE: "상태",
    LOCATION_INFO: "위치",
    RULE: "규칙",
    DESCRIPTION_TEXT: "설명",
  };
  return labels[type] ?? type;
}
