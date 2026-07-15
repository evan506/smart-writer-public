import { describe, expect, it } from "vitest";
import {
  normalizeExtractionResponse,
  parseExtractionResponse,
} from "@/lib/services/entity-extraction/response-normalizer";

describe("entity extraction response normalizer", () => {
  it("normalizes entity aliases and drops invalid entity rows", () => {
    expect(
      normalizeExtractionResponse({
        entities: [
          { name: "리엔", type: "CHARACTER", aliases: ["리엔스", 1, null] },
          { name: "", type: "CHARACTER", aliases: ["빈 이름"] },
          { type: "PLACE", aliases: ["이름 없음"] },
        ],
        relations: [{ from_name: "리엔", to_name: "루나" }],
      })
    ).toEqual({
      entities: [
        { name: "리엔", type: "CHARACTER", aliases: ["리엔스"], facts: [] },
      ],
      relations: [{ from_name: "리엔", to_name: "루나" }],
    });
  });

  it("normalizes optional fact candidates and drops malformed facts", () => {
    expect(
      normalizeExtractionResponse({
        entities: [
          {
            name: "리엔",
            type: "CHARACTER",
            aliases: [],
            facts: [
              {
                fact_type: "ROLE",
                fact_key: "title",
                value: "변방 마을의 영주",
                evidence_text: "리엔은 변방 마을의 영주로 불렸다.",
                confidence: 2,
              },
              {
                fact_type: "UNKNOWN",
                value: "잘못된 타입",
                evidence: "리엔은 변방 마을의 영주로 불렸다.",
              },
              {
                fact_type: "ROLE",
                value: "",
                evidence: "리엔은 변방 마을의 영주로 불렸다.",
              },
            ],
          },
        ],
        relations: [],
      }).entities[0].facts
    ).toEqual([
      {
        fact_type: "ROLE",
        fact_key: "title",
        value: "변방 마을의 영주",
        evidence: "리엔은 변방 마을의 영주로 불렸다.",
        confidence: 1,
      },
    ]);
  });

  it("drops subjective description facts", () => {
    expect(
      normalizeExtractionResponse({
        entities: [
          {
            name: "리엔",
            type: "CHARACTER",
            facts: [
              {
                fact_type: "DESCRIPTION_TEXT",
                value: "웃는 얼굴로 쌍욕을 지껄이는 성격",
                evidence: "'지랄은' 웃는 얼굴로 쌍욕을 지껄인 리엔 하르트",
              },
            ],
          },
        ],
        relations: [],
      }).entities[0].facts
    ).toEqual([]);
  });

  it("parses fenced responses and repairs unescaped Korean dialogue quotes", () => {
    const parsed = parseExtractionResponse(`\`\`\`json
{
  "entities": [
    {
      "name": "리엔",
      "type": "CHARACTER",
      "summary": ""그만둬"라고 말했다",
      "aliases": ["Dino"]
    }
  ],
  "relations": []
}
\`\`\``);

    expect(parsed?.entities[0]?.summary).toBe("'그만둬'라고 말했다");
    expect(parsed?.entities[0]?.aliases).toEqual(["Dino"]);
  });

  it("returns null for responses that cannot be parsed", () => {
    expect(parseExtractionResponse("not json")).toBeNull();
  });
});
