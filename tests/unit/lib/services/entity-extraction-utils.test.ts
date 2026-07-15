import { describe, expect, it } from "vitest";
import type { ExtractedEntity } from "@/lib/services/prompt-templates";
import {
  extractJSONArray,
  repairJSONQuotes,
} from "@/lib/services/entity-extraction/response-parser";
import {
  canAutoMergeSubstringEntities,
  shouldAutoMergeCharacterSubstring,
} from "@/lib/services/entity-extraction/merge-policy";
import { linkSameBatchCharacterAliasRefs } from "@/lib/services/entity-extraction/alias-policy";
import {
  filterEntityCandidates,
  isStandaloneGenericRoleCandidate,
  normalizeGroupLikeCharacterCandidates,
  normalizedNameSet,
  normalizeSpeciesLikeCharacterCandidates,
} from "@/lib/services/entity-extraction/candidate-policy";

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

describe("entity extraction utils", () => {
  it("filters confirmed, excluded, genre-excluded, and one-letter candidates", () => {
    const result = filterEntityCandidates(
      ["리엔", "마왕", "길드", "A", " 북부 기사단 "],
      normalizedNameSet(["리 엔"]),
      normalizedNameSet(["길드"]),
      normalizedNameSet(["마왕"])
    );

    expect(result).toEqual([" 북부 기사단 "]);
  });

  it("filters standalone generic role nouns while preserving qualified titles", () => {
    const result = filterEntityCandidates(
      ["사자", "전령", "경비병", "하인", "상인", "영주", "왕", "전사", "개척자", "노예들", "제국민", "야만인", "도어락", "케이지", "늑대귀", "꼬맹이", "배신자", "검은 탑의 사자", "엘프 왕", "미래 기사", "관상용 케이지", "강철주먹 카일", "늑대 수인 꼬맹이", "여우귀 수인"],
      normalizedNameSet([]),
      normalizedNameSet([]),
      normalizedNameSet([])
    );

    expect(result).toEqual(["검은 탑의 사자", "엘프 왕", "미래 기사", "관상용 케이지", "강철주먹 카일", "늑대 수인 꼬맹이", "여우귀 수인"]);
  });

  it("detects only standalone generic role candidates", () => {
    expect(isStandaloneGenericRoleCandidate("사자")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("영주")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("왕")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("개척자")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("노예들")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("제국민")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("야만인")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("도어락")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("케이지")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("늑대귀")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("꼬맹이")).toBe(true);
    expect(isStandaloneGenericRoleCandidate("배신자")).toBe(true);
    expect(isStandaloneGenericRoleCandidate(" 검은 탑의 사자 ")).toBe(false);
    expect(isStandaloneGenericRoleCandidate("엘프 왕")).toBe(false);
    expect(isStandaloneGenericRoleCandidate("미래 기사")).toBe(false);
    expect(isStandaloneGenericRoleCandidate("관상용 케이지")).toBe(false);
    expect(isStandaloneGenericRoleCandidate("여우귀 수인")).toBe(false);
    expect(isStandaloneGenericRoleCandidate("강철주먹 카일")).toBe(false);
    expect(isStandaloneGenericRoleCandidate("늑대 수인 꼬맹이")).toBe(false);
  });

  it("limits substring auto-merge to character entities", () => {
    expect(canAutoMergeSubstringEntities("CHARACTER")).toBe(true);
    expect(canAutoMergeSubstringEntities("CONCEPT")).toBe(false);
    expect(canAutoMergeSubstringEntities("PLACE")).toBe(false);
    expect(canAutoMergeSubstringEntities("ORGANIZATION")).toBe(false);
  });

  it("only auto-merges prefix character abbreviations", () => {
    expect(shouldAutoMergeCharacterSubstring("리엔", "리엔 하르트")).toBe(true);
    expect(shouldAutoMergeCharacterSubstring("카일", "강철주먹 카일")).toBe(false);
    expect(shouldAutoMergeCharacterSubstring("수인", "늑대 수인")).toBe(false);
  });

  it("links same-batch title plus name expressions as alias refs", () => {
    const result = linkSameBatchCharacterAliasRefs([
      entity({ name: "카일", confidence: 0.9 }),
      entity({ name: "강철주먹 카일", confidence: 0.9 }),
      entity({ name: "리엔 하르트", confidence: 0.9 }),
      entity({ name: "리엔", confidence: 0.8 }),
      entity({ name: "늑대 수인", type: "CONCEPT", confidence: 0.9 }),
    ]);

    expect(result.find((item) => item.name === "강철주먹 카일")).toMatchObject({
      sub_type: "alias_ref",
      alias_of: "카일",
    });
    expect(result.find((item) => item.name === "리엔 하르트")?.sub_type).toBeUndefined();
    expect(result.find((item) => item.name === "늑대 수인")?.sub_type).toBeUndefined();
  });

  it("normalizes species-like character candidates only in generic contexts", () => {
    const result = normalizeSpeciesLikeCharacterCandidates([
      entity({
        name: "늑대 수인",
        type: "CHARACTER",
        context_snippet: "늑대 수인들은 오랫동안 제국의 노예제도를 겪었다.",
      }),
      entity({
        name: "소머리 수인",
        type: "CHARACTER",
        context_snippet: "문제 일으키지 말라고 그렇게 말하는 소머리 수인은 쿨하게 통과시켰다.",
      }),
      entity({
        name: "늑대 수인",
        type: "CHARACTER",
        context_snippet: "늑대 수인 꼬마 내 거점 도어락 카드와 내 전투법을 고스란히 물려받은 그 녀석",
      }),
      entity({
        name: "루무",
        type: "CHARACTER",
        context_snippet: "난 루무!",
      }),
    ]);

    expect(result.find((item) => item.name === "늑대 수인")).toMatchObject({
      type: "CONCEPT",
      sub_type: "species",
    });
    expect(result.find((item) => item.name === "소머리 수인")).toMatchObject({
      type: "CHARACTER",
    });
    expect(result.filter((item) => item.name === "늑대 수인")[1]).toMatchObject({
      type: "CHARACTER",
    });
    expect(result.find((item) => item.name === "루무")).toMatchObject({
      type: "CHARACTER",
    });
  });

  it("normalizes group-like character candidates in plural contexts", () => {
    const result = normalizeGroupLikeCharacterCandidates([
      entity({
        name: "완성된 노예",
        type: "CHARACTER",
        context_snippet: "녀석은 완성된 노예들과 함께 있었다.",
      }),
      entity({
        name: "여우 꼬마",
        type: "CHARACTER",
        context_snippet: "여우 꼬마가 살던 마을을 불태웠다고 한다.",
      }),
    ]);

    expect(result.find((item) => item.name === "완성된 노예")).toMatchObject({
      type: "CONCEPT",
      sub_type: "role",
    });
    expect(result.find((item) => item.name === "여우 꼬마")).toMatchObject({
      type: "CHARACTER",
    });
  });

  it("extracts JSON arrays from fenced or prefixed LLM output", () => {
    expect(extractJSONArray("```json\n[\"리엔\", \"루나\"]\n```")).toEqual([
      "리엔",
      "루나",
    ]);
    expect(extractJSONArray("후보입니다:\n[{\"name\":\"리엔\"}]")).toEqual([
      { name: "리엔" },
    ]);
    expect(extractJSONArray("{\"entities\":[{\"name\":\"리엔\"}]}")).toEqual([
      { name: "리엔" },
    ]);
  });

  it("repairs common JSON quote and trailing comma issues", () => {
    const repaired = repairJSONQuotes(`[
  {
    "summary": "그가 "왕"이라고 말했다",
  }
]`);

    expect(JSON.parse(repaired)).toEqual([
      { summary: "그가 '왕'이라고 말했다" },
    ]);
  });

});
