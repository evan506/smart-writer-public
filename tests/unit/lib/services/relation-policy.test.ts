import { describe, expect, it } from "vitest";
import {
  hasAnyCharacterRelationEvidence,
  hasCharacterRelationEvidence,
  isAutoRegisterableRelation,
  isValidCrossTypeRelation,
  isValidRelationType,
} from "@/lib/services/entity-extraction/relation-policy";

describe("relation extraction policy", () => {
  it("accepts only supported relation types", () => {
    expect(isValidRelationType("MEMBER_OF")).toBe(true);
    expect(isValidRelationType("ORIGIN_OF")).toBe(true);
    expect(isValidRelationType("USES")).toBe(true);
    expect(isValidRelationType("PROTECTS")).toBe(true);
    expect(isValidRelationType("UNKNOWN_RELATION")).toBe(false);
  });

  it("validates relation types against entity type pairs", () => {
    expect(isValidCrossTypeRelation("CHARACTER", "ORGANIZATION", "MEMBER_OF")).toBe(true);
    expect(isValidCrossTypeRelation("ORGANIZATION", "CHARACTER", "MEMBER_OF")).toBe(false);
    expect(isValidCrossTypeRelation("CHARACTER", "ITEM", "OWNS")).toBe(true);
    expect(isValidCrossTypeRelation("CHARACTER", "PLACE", "OWNS")).toBe(false);
    expect(isValidCrossTypeRelation("CHARACTER", "CONCEPT", "SPECIES_OF")).toBe(true);
    expect(isValidCrossTypeRelation("CHARACTER", "CONCEPT", "MEMBER_OF")).toBe(true);
    expect(isValidCrossTypeRelation("CHARACTER", "CONCEPT", "ENEMY")).toBe(false);
    expect(isValidCrossTypeRelation("CHARACTER", "CONCEPT", "LEADER_OF")).toBe(false);
    expect(isValidCrossTypeRelation("CHARACTER", "MAGIC_SYSTEM", "USES")).toBe(true);
    expect(isValidCrossTypeRelation("ORGANIZATION", "PLACE", "PROTECTS")).toBe(true);
    expect(isValidCrossTypeRelation("CONCEPT", "CONCEPT", "SPECIES_OF")).toBe(false);
    expect(isValidCrossTypeRelation("CHARACTER", "CHARACTER", "MEMBER_OF")).toBe(false);
    expect(isValidCrossTypeRelation("CHARACTER", "CHARACTER", "LEADER_OF")).toBe(false);
    expect(isValidCrossTypeRelation("CHARACTER", "CHARACTER", "OWNS")).toBe(false);
  });

  it("auto-registers only factual high-confidence relation types", () => {
    expect(
      isAutoRegisterableRelation({ relation_type: "MEMBER_OF", weight: 0.75 })
    ).toBe(true);
    expect(
      isAutoRegisterableRelation({ relation_type: "MEMBER_OF", weight: 0.74 })
    ).toBe(false);
    expect(
      isAutoRegisterableRelation({ relation_type: "ALLY", weight: 0.95 })
    ).toBe(false);
  });

  it("requires concrete evidence for character-character relation candidates", () => {
    expect(
      hasAnyCharacterRelationEvidence("리엔과 미라는 같은 방에 있었다.")
    ).toBe(false);
    expect(
      hasCharacterRelationEvidence("ALLY", "리엔과 미라는 함께 마족에게 맞서 싸웠다.")
    ).toBe(true);
    expect(
      hasCharacterRelationEvidence("ENEMY", "리엔은 엘프 왕에게 복수하겠다고 이를 갈았다.")
    ).toBe(true);
    expect(
      hasCharacterRelationEvidence("SERVES", "미라는 리엔을 주인으로 모시며 명령을 기다렸다.")
    ).toBe(true);
    expect(
      hasCharacterRelationEvidence("MENTOR_OF", "카이론은 리엔에게 검술을 가르친 스승이었다.")
    ).toBe(true);
    expect(
      hasCharacterRelationEvidence("FRIEND", "카일은 리켈과 대화를 나눴다.")
    ).toBe(false);
  });

  it("rejects broad Korean substring false positives as relation evidence", () => {
    const falsePositiveSnippets = [
      "리엔과 미라가 본 장면은 인상적이었다.",
      "리엔과 미라는 목적지를 향해 걸었다.",
      "리엔과 미라는 지도와 나침반을 펼쳤다.",
      "리엔과 미라는 새로운 형태의 문장을 보았다.",
      "리엔과 미라는 명령문을 종이에 적었다.",
      "리엔과 미라는 주인공의 이름을 읽었다.",
    ];

    for (const snippet of falsePositiveSnippets) {
      expect(hasAnyCharacterRelationEvidence(snippet), snippet).toBe(false);
    }
  });
});
