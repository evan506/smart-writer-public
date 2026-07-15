import { describe, expect, it } from "vitest";
import {
  assembleCodexForeshadowEvidence,
  assembleCodexRelationEvidence,
  buildCodexNameToIdMap,
} from "@/lib/services/codex-evidence-utils";

describe("codex evidence utils", () => {
  it("resolves canonical entity ids from aliases", () => {
    const map = buildCodexNameToIdMap([
      {
        id: "entity-rikel",
        name: "리켈",
        aliases: ["은빛 까마귀", "불과 폭풍의 마왕"],
      },
    ]);

    expect(map.get("리켈")).toBe("entity-rikel");
    expect(map.get("은빛 까마귀")).toBe("entity-rikel");
    expect(map.get("불과 폭풍의 마왕")).toBe("entity-rikel");
  });

  it("maps confirmed relation suggestions to entity link evidence through aliases", () => {
    const result = assembleCodexRelationEvidence({
      entities: [
        {
          id: "entity-rikel",
          name: "리켈",
          aliases: ["은빛 까마귀"],
        },
        {
          id: "entity-gate",
          name: "성문",
          aliases: [],
        },
      ],
      links: [
        {
          id: "link-1",
          from_id: "entity-rikel",
          to_id: "entity-gate",
          relation_type: "LOCATED_IN",
          direction: "UNI",
        },
      ],
      relationSuggestions: [
        {
          id: "suggestion-1",
          chapter_id: "chapter-1",
          name: "은빛 까마귀 → 성문",
          aliases: {
            from_name: "은빛 까마귀",
            to_name: "성문",
            relation_type: "LOCATED_IN",
          },
          context_snippet: "은빛 까마귀는 성문 앞에 섰다.",
          updated_at: "2026-05-21T00:00:00.000Z",
        },
      ],
      chapters: [{ id: "chapter-1", chapter_num: 3 }],
    });

    expect(result).toEqual({
      "link-1": [
        {
          id: "suggestion-1",
          chapterId: "chapter-1",
          chapterNum: 3,
          name: "은빛 까마귀 → 성문",
          relationType: "LOCATED_IN",
          contextSnippet: "은빛 까마귀는 성문 앞에 섰다.",
          updatedAt: "2026-05-21T00:00:00.000Z",
        },
      ],
    });
  });

  it("ignores invalid relation metadata and missing chapter mappings", () => {
    const result = assembleCodexRelationEvidence({
      entities: [
        { id: "entity-a", name: "리켈", aliases: [] },
        { id: "entity-b", name: "성문", aliases: [] },
      ],
      links: [
        {
          id: "link-1",
          from_id: "entity-a",
          to_id: "entity-b",
          relation_type: "LOCATED_IN",
          direction: "UNI",
        },
      ],
      relationSuggestions: [
        {
          id: "bad-meta",
          chapter_id: "chapter-1",
          name: "bad",
          aliases: { from_name: "리켈", relation_type: "LOCATED_IN" },
          context_snippet: null,
          updated_at: null,
        },
        {
          id: "missing-chapter",
          chapter_id: "missing",
          name: "missing chapter",
          aliases: {
            from_name: "리켈",
            to_name: "성문",
            relation_type: "LOCATED_IN",
          },
          context_snippet: null,
          updated_at: null,
        },
      ],
      chapters: [{ id: "chapter-1", chapter_num: 1 }],
    });

    expect(result).toEqual({});
  });

  it("filters foreshadow history to known linked entity ids", () => {
    const result = assembleCodexForeshadowEvidence(
      [
        {
          id: "foreshadow-1",
          description: "아이들이 리켈을 두려운 호칭으로 부르는 이유",
          planted_chapter: 1,
          expected_reveal: 5,
          status: "PLANTED",
          entity_ids: ["entity-rikel", "foreign-entity"],
        },
        {
          id: "foreshadow-2",
          description: "잘못된 링크 형태",
          planted_chapter: 2,
          expected_reveal: null,
          status: "PLANTED",
          entity_ids: "entity-rikel",
        },
      ],
      ["entity-rikel"]
    );

    expect(result).toEqual({
      "entity-rikel": [
        {
          id: "foreshadow-1",
          description: "아이들이 리켈을 두려운 호칭으로 부르는 이유",
          plantedChapter: 1,
          expectedReveal: 5,
          status: "PLANTED",
        },
      ],
    });
  });
});
