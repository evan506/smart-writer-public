import { describe, expect, it } from "vitest";
import { RELATION_COLORS, RELATION_TYPE_LABELS } from "@/lib/design-tokens";

describe("design tokens", () => {
  it("has writer-facing labels for every colored relation type", () => {
    for (const relationType of Object.keys(RELATION_COLORS)) {
      expect(RELATION_TYPE_LABELS[relationType]).toBeTruthy();
      expect(RELATION_TYPE_LABELS[relationType]).not.toBe(relationType);
    }
  });

  it("labels relation types that can appear in graph and suggestion UI", () => {
    expect(RELATION_TYPE_LABELS).toMatchObject({
      ALLY: "동맹",
      ENEMY: "적대",
      MEMBER_OF: "소속",
      CREATED_BY: "생성",
      LOCATED_IN: "위치",
      BELONGS_TO: "소속",
      PROTECTS: "보호",
    });
  });
});
