import { describe, expect, it } from "vitest";
import type {
  ClassifiedEntity,
  ExtractedEntity,
  KnownEntity,
} from "@/lib/services/prompt-templates";
import {
  buildEntityExtractionRunnerSets,
  normalizeClassifiedEntitiesForRunner,
  partitionEntityWriteCandidates,
} from "@/lib/services/entity-extraction/runner";

function classified(
  overrides: Partial<ClassifiedEntity> & Pick<ClassifiedEntity, "name">
): ClassifiedEntity {
  return {
    type: "CHARACTER",
    importance: "high",
    summary: "",
    confidence: 0.7,
    context_snippet: "",
    ...overrides,
  };
}

function extracted(
  overrides: Partial<ExtractedEntity> & Pick<ExtractedEntity, "name">
): ExtractedEntity {
  return {
    type: "CHARACTER",
    summary: "",
    aliases: [],
    confidence: 0.7,
    context_snippet: "",
    ...overrides,
  };
}

const knownEntities: KnownEntity[] = [
  {
    id: "entity-1",
    name: "리켈",
    type: "CHARACTER",
    aliases: ["검은 늑대"],
  },
];

describe("entity extraction runner helpers", () => {
  it("builds normalized filter sets and stage 1 exclusions from loaded data", () => {
    const result = buildEntityExtractionRunnerSets({
      knownEntitiesData: {
        names: ["리켈", "검은 늑대"],
        typed: knownEntities,
      },
      suggestionNames: ["아린"],
      genreRulesData: {
        excludedCharacterTerms: ["마왕"],
      },
      projectExcludedTerms: ["길드"],
    });

    expect(result.allExcludedTerms).toEqual(["길드", "마왕"]);
    expect(result.confirmedNamesSet.has("리켈")).toBe(true);
    expect(result.confirmedNamesSet.has("검은늑대")).toBe(true);
    expect(result.excludedTermsSet.has("길드")).toBe(true);
    expect(result.genreExcludedSet.has("마왕")).toBe(true);
    expect(result.stage1ExcludeNames).toEqual([
      "리켈",
      "검은 늑대",
      "아린",
      "길드",
      "마왕",
    ]);
  });

  it("normalizes classified entities and drops only the runner-level rejected candidates", () => {
    const result = normalizeClassifiedEntitiesForRunner([
      classified({
        name: "아린",
        type: "CHARACTER",
        summary: "새 인물",
        confidence: 0.7,
        context_snippet: "아린이 문을 열었다.",
      }),
      classified({
        name: "낮은 단역",
        type: "CHARACTER",
        importance: "low",
        confidence: 0.5,
      }),
      classified({
        name: "별칭",
        sub_type: "alias_ref",
        alias_of: "아린",
        confidence: 0.5,
      }),
      classified({
        name: "목표 없는 별칭",
        sub_type: "alias_ref",
        confidence: 0.9,
      }),
      classified({
        name: "미분류",
        type: "UNKNOWN",
        confidence: 0.9,
      }),
    ]);

    expect(result.map((entity) => entity.name)).toEqual(["아린", "별칭"]);
    expect(result[0]).toMatchObject({
      name: "아린",
      type: "CHARACTER",
      summary: "새 인물",
      aliases: [],
      confidence: 0.7,
      context_snippet: "아린이 문을 열었다.",
    });
    expect(result[1]).toMatchObject({
      name: "별칭",
      sub_type: "alias_ref",
      alias_of: "아린",
    });
  });

  it("keeps only source-backed fact candidates while normalizing entities", () => {
    const result = normalizeClassifiedEntitiesForRunner(
      [
        classified({
          name: "리엔",
          type: "CHARACTER",
          context_snippet: "리엔은 변방 마을의 영주로 불렸다.",
          facts: [
            {
              fact_type: "ROLE",
              value: "변방 마을의 영주",
              evidence: "리엔은 변방 마을의 영주로 불렸다.",
              confidence: 0.8,
            },
            {
              fact_type: "ROLE",
              value: "황실 기사",
              evidence: "원문에 없는 근거",
              confidence: 0.8,
            },
            {
              fact_type: "UNKNOWN",
              value: "잘못된 타입",
              evidence: "리엔은 변방 마을의 영주로 불렸다.",
              confidence: 0.8,
            },
          ],
        }),
      ],
      "리엔은 변방 마을의 영주로 불렸다."
    );

    expect(result[0].facts).toEqual([
      {
        fact_type: "ROLE",
        value: "변방 마을의 영주",
        evidence: "리엔은 변방 마을의 영주로 불렸다.",
        confidence: 0.8,
      },
    ]);
  });

  it("drops subjective description facts that turn one-off tone into canon", () => {
    const result = normalizeClassifiedEntitiesForRunner(
      [
        classified({
          name: "리엔",
          type: "CHARACTER",
          context_snippet: "'지랄은' 웃는 얼굴로 쌍욕을 지껄인 리엔 하르트",
          facts: [
            {
              fact_type: "DESCRIPTION_TEXT",
              value: "웃는 얼굴로 쌍욕을 지껄이는 성격",
              evidence: "'지랄은' 웃는 얼굴로 쌍욕을 지껄인 리엔 하르트",
              confidence: 0.8,
            },
            {
              fact_type: "ROLE",
              value: "변방 마을의 영주",
              evidence: "리엔은 변방 마을의 영주로 불렸다.",
              confidence: 0.8,
            },
          ],
        }),
      ],
      "'지랄은' 웃는 얼굴로 쌍욕을 지껄인 리엔 하르트 리엔은 변방 마을의 영주로 불렸다."
    );

    expect(result[0].facts).toEqual([
      {
        fact_type: "ROLE",
        value: "변방 마을의 영주",
        evidence: "리엔은 변방 마을의 영주로 불렸다.",
        confidence: 0.8,
      },
    ]);
  });

  it("drops role facts that describe scene participation instead of a stable role", () => {
    const result = normalizeClassifiedEntitiesForRunner(
      [
        classified({
          name: "리엔",
          type: "CHARACTER",
          context_snippet: "리엔은 왕에게 핀잔을 듣고 있었다.",
          facts: [
            {
              fact_type: "ROLE",
              value: "왕과 대화하는 인물",
              evidence: "리엔은 왕에게 핀잔을 듣고 있었다.",
              confidence: 0.8,
            },
            {
              fact_type: "ROLE",
              value: "대화 참여자",
              evidence: "베릴의 의문에 리켈이 호통을 치며 정정했다.",
              confidence: 0.8,
            },
            {
              fact_type: "ROLE",
              value: "훈련 관련 의사결정자",
              evidence: "패니의 논리에 고개를 끄덕이려다가 멈칫했다.",
              confidence: 0.8,
            },
            {
              fact_type: "ROLE",
              value: "상황 관찰자",
              evidence: "패니의 논리에 고개를 끄덕이려다가 멈칫했다.",
              confidence: 0.8,
            },
            {
              fact_type: "ROLE",
              value: "대장의 상황을 알리려는 인물",
              evidence: "대장이 위험에 처해있다고 수작 부리려고 했지만",
              confidence: 0.8,
            },
            {
              fact_type: "ROLE",
              value: "화자에게 기억에 남는 인물",
              evidence: "리켈이 지껄인 개소리가 마음에 걸린 것",
              confidence: 0.8,
            },
            {
              fact_type: "ROLE",
              value: "엄격한 훈련자",
              evidence: "인정사정 없는 패니의 훈련",
              confidence: 0.8,
            },
            {
              fact_type: "ROLE",
              value: "변방 마을의 영주",
              evidence: "전방의 아무 마을에나 가서 영주나 하라.",
              confidence: 0.8,
            },
          ],
        }),
      ],
      "리엔은 왕에게 핀잔을 듣고 있었다. 전방의 아무 마을에나 가서 영주나 하라."
    );

    expect(result[0].facts).toEqual([
      {
        fact_type: "ROLE",
        value: "변방 마을의 영주",
        evidence: "전방의 아무 마을에나 가서 영주나 하라.",
        confidence: 0.8,
      },
    ]);
  });

  it("drops transient emotional state facts", () => {
    const result = normalizeClassifiedEntitiesForRunner(
      [
        classified({
          name: "꼬꼬마 늑대 수인",
          type: "CHARACTER",
          context_snippet: "꼬꼬마 늑대 수인이 벌벌 떨면서 찾아오는데",
          facts: [
            {
              fact_type: "STATE",
              value: "두려워하며 떨고 있음",
              evidence: "꼬꼬마 늑대 수인이 벌벌 떨면서 찾아오는데",
              confidence: 0.8,
            },
            {
              fact_type: "STATE",
              value: "지친 상태",
              evidence: "슬슬 지쳐가는 투투와 루무의 모습",
              confidence: 0.8,
            },
            {
              fact_type: "STATE",
              value: "지침",
              evidence: "슬슬 지쳐가는 투투와 루무의 모습",
              confidence: 0.8,
            },
            {
              fact_type: "STATE",
              value: "불평하는 상태",
              evidence: "리엘의 불평",
              confidence: 0.8,
            },
            {
              fact_type: "STATE",
              value: "부단장에게 포박됨",
              evidence: "부단장이 그 쥐새끼를 잡으러 갔다.",
              confidence: 0.8,
            },
          ],
        }),
      ],
      "꼬꼬마 늑대 수인이 벌벌 떨면서 찾아오는데 부단장이 그 쥐새끼를 잡으러 갔다."
    );

    expect(result[0].facts).toEqual([
      {
        fact_type: "STATE",
        value: "부단장에게 포박됨",
        evidence: "부단장이 그 쥐새끼를 잡으러 갔다.",
        confidence: 0.8,
      },
    ]);
  });

  it("drops scene-derived role and description facts", () => {
    const result = normalizeClassifiedEntitiesForRunner(
      [
        classified({
          name: "엘크",
          type: "CHARACTER",
          context_snippet: "엘크 집에서 파티할거니까 꼭 와!",
          facts: [
            {
              fact_type: "ROLE",
              value: "파티 주최자",
              evidence: "엘크 집에서 파티할거니까 꼭 와!",
              confidence: 0.6,
            },
          ],
        }),
        classified({
          name: "마족",
          type: "CONCEPT",
          context_snippet: "한명은 마족처럼 귀에 나뭇가지를 끼웠고",
          facts: [
            {
              fact_type: "DESCRIPTION_TEXT",
              value: "귀에 나뭇가지를 끼우는 특징이 있는 종족",
              evidence: "한명은 마족처럼 귀에 나뭇가지를 끼웠고",
              confidence: 0.7,
            },
          ],
        }),
        classified({
          name: "리켈",
          type: "CHARACTER",
          context_snippet: "언젠가 리켈이 지껄인 개소리가 마음에 걸린 것이다.",
          facts: [
            {
              fact_type: "DESCRIPTION_TEXT",
              value: "말이 많은 인물",
              evidence: "리켈이 지껄인 개소리",
              confidence: 0.7,
            },
          ],
        }),
      ],
      "엘크 집에서 파티할거니까 꼭 와! 한명은 마족처럼 귀에 나뭇가지를 끼웠고 언젠가 리켈이 지껄인 개소리가 마음에 걸린 것이다."
    );

    expect(result[0].facts).toEqual([]);
    expect(result[1].facts).toEqual([]);
    expect(result[2].facts).toEqual([]);
  });

  it("keeps high-confidence alias references in pending review instead of auto-confirming them", () => {
    const auto = extracted({ name: "아린", confidence: 0.9 });
    const pending = extracted({ name: "리오", confidence: 0.7 });
    const lowAlias = extracted({
      name: "검은 늑대",
      sub_type: "alias_ref",
      alias_of: "리켈",
      confidence: 0.6,
    });
    const highAlias = extracted({
      name: "늑대 경",
      sub_type: "alias_ref",
      alias_of: "리켈",
      confidence: 0.95,
    });

    const result = partitionEntityWriteCandidates([
      auto,
      pending,
      lowAlias,
      highAlias,
    ]);

    expect(result.toAutoConfirm).toEqual([auto]);
    expect(result.toPending).toEqual([pending, lowAlias]);
    expect(result.aliasRefs).toEqual([lowAlias, highAlias]);
    expect(result.pendingCandidates).toEqual([pending, lowAlias, highAlias]);
  });
});
