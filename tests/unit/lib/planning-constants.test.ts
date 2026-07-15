import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLANNING_BLOCKS,
  PLANNING_CHILD_KIND_LABELS,
  PLANNING_STATUS_LABELS,
} from "@/lib/planning/constants";

describe("planning constants", () => {
  it("keeps the default progressive planning order", () => {
    expect(DEFAULT_PLANNING_BLOCKS.map((block) => block.title)).toEqual([
      "시작",
      "전개",
      "전환",
      "결말",
    ]);
    expect(DEFAULT_PLANNING_BLOCKS.map((block) => block.structureKey)).toEqual([
      "START",
      "DEVELOPMENT",
      "TURN",
      "ENDING",
    ]);
  });

  it("maps planning statuses to writer-facing Korean labels", () => {
    expect(PLANNING_STATUS_LABELS).toMatchObject({
      PLANNED: "계획만 있음",
      EXPANDED: "구체화됨",
      NEEDS_DETAIL: "상세 필요",
      MANUSCRIPT_SEEN: "원고 등장",
      MEMORY_LINKED: "기억 연결",
      NEEDS_REVIEW: "확인 필요",
    });
  });

  it("includes the MVP child card types", () => {
    expect(PLANNING_CHILD_KIND_LABELS).toMatchObject({
      EPISODE: "에피소드",
      CHAPTER: "화",
      SCENE: "장면",
      EVENT: "사건",
      PROMISE: "작품 약속",
      CHARACTER_PLAN: "인물 계획",
      PLACE_PLAN: "장소 계획",
    });
  });
});
