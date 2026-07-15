import { describe, expect, it } from "vitest";
import type { ExtractedEntity, ExtractedRelation } from "@/lib/services/prompt-templates";
import {
  mergeEntities,
  mergeRelations,
  resolveRelationConflicts,
} from "@/lib/services/entity-extraction/merge-helpers";

function entity(partial: Partial<ExtractedEntity> & Pick<ExtractedEntity, "name">): ExtractedEntity {
  return {
    type: "CHARACTER",
    summary: "",
    aliases: [],
    confidence: 0.7,
    context_snippet: "",
    ...partial,
  };
}

function relation(partial: Partial<ExtractedRelation>): ExtractedRelation {
  return {
    from_name: "A",
    to_name: "B",
    relation_type: "ALLY",
    direction: "UNI",
    weight: 0.6,
    context_snippet: "",
    ...partial,
  };
}

describe("entity extraction merge helpers", () => {
  it("merges aliases into the more specific entity name", () => {
    const result = mergeEntities([
      entity({ name: "리엔", aliases: ["소년"], confidence: 0.7 }),
      entity({ name: "리엔 하르트", aliases: ["리엔"], confidence: 0.8 }),
    ]);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].name).toBe("리엔 하르트");
    expect(result.entities[0].aliases).toEqual(expect.arrayContaining(["리엔", "소년"]));
    expect(result.nameMap.get("리엔")).toBe("리엔 하르트");
  });

  it("keeps the strongest duplicate relation", () => {
    const result = mergeRelations([
      relation({ weight: 0.4, context_snippet: "weak" }),
      relation({ weight: 0.9, context_snippet: "strong" }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].context_snippet).toBe("strong");
  });

  it("marks ally/enemy conflicts for author review", () => {
    const result = resolveRelationConflicts([
      relation({ relation_type: "ALLY", weight: 0.8 }),
      relation({ relation_type: "ENEMY", weight: 0.7 }),
    ]);

    expect(result).toHaveLength(2);
    expect(result.every((item) => item.conflict_note?.includes("ALLY/ENEMY"))).toBe(true);
  });
});
