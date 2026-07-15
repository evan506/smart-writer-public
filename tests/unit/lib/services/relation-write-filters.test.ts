import { describe, expect, it, vi } from "vitest";
import { filterValidRelations } from "@/lib/services/entity-extraction/relation-write-filters";
import type { ExtractedRelation } from "@/lib/services/prompt-templates";

function relation(input: Partial<ExtractedRelation>): ExtractedRelation {
  return {
    from_name: "리엔",
    to_name: "미라",
    relation_type: "ALLY",
    direction: "BI",
    weight: 0.8,
    context_snippet: "리엔과 미라는 함께 마족에게 맞서 싸웠다.",
    ...input,
  };
}

describe("relation write filters", () => {
  it("drops source-backed but semantically invalid relation candidates", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const normalizeName = (name: string) => name.replace(/\s+/g, "").toLowerCase();
    const validEntityNames = new Set(["리엔", "미라", "검은탑"].map(normalizeName));
    const nameToType = new Map([
      [normalizeName("리엔"), "CHARACTER"],
      [normalizeName("미라"), "CHARACTER"],
      [normalizeName("검은 탑"), "PLACE"],
    ]);

    try {
      const result = filterValidRelations(
        [
          relation({
            context_snippet: "리엔과 미라는 같은 방에 있었다.",
          }),
          relation({
            to_name: "검은 탑",
            relation_type: "ALLY",
            context_snippet: "리엔은 검은 탑에서 오래된 문장을 발견했다.",
          }),
          relation({}),
        ],
        {
          validEntityNames,
          normalizeName,
          nameToType,
          confirmedCount: 3,
        }
      );

      expect(result).toEqual([relation({})]);
    } finally {
      log.mockRestore();
    }
  });
});
