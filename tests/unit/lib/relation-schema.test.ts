import { describe, expect, it } from "vitest";
import {
  RELATION_COLORS,
  RELATION_SCHEMA,
  RELATION_TYPE_LABELS,
  RELATION_TYPES,
  isAllowedRelationPair,
  renderRelationAllowedPairSpec,
  renderRelationPromptSpec,
} from "@/lib/relation-schema";

describe("relation schema", () => {
  it("is the single source for relation labels, colors, and prompt text", () => {
    for (const type of RELATION_TYPES) {
      expect(RELATION_SCHEMA[type]).toBeTruthy();
      expect(RELATION_TYPE_LABELS[type]).toBe(RELATION_SCHEMA[type].label);
      expect(RELATION_COLORS[type]).toBe(RELATION_SCHEMA[type].color);
      expect(renderRelationPromptSpec()).toContain(type);
      expect(renderRelationAllowedPairSpec()).toContain(type);
    }
  });

  it("validates directed pairs while allowing bidirectional relation reversals", () => {
    expect(isAllowedRelationPair("CHARACTER", "ORGANIZATION", "MEMBER_OF")).toBe(true);
    expect(isAllowedRelationPair("ORGANIZATION", "CHARACTER", "MEMBER_OF")).toBe(false);
    expect(isAllowedRelationPair("CHARACTER", "CHARACTER", "ALLY")).toBe(true);
    expect(isAllowedRelationPair("CHARACTER", "PLACE", "ALLY")).toBe(false);
  });
});
