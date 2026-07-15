import { describe, expect, it } from "vitest";
import { classifyQuery, selectModes } from "@/lib/services/query-router";
import type { QueryClassification } from "@/types";

describe("classifyQuery", () => {
  it("classifies a short query (<=8 chars) as bm25 with confidence 0.8", () => {
    const result = classifyQuery("abcdefgh"); // exactly 8 chars, non-Korean

    expect(result.mode).toBe("bm25");
    expect(result.confidence).toBe(0.8);
  });

  it("classifies a quoted query as bm25 even when longer than 8 chars", () => {
    const query = '"드래곤이 사는 깊은 계곡 이야기"'; // quoted, well over 8 chars

    expect(query.length).toBeGreaterThan(8);

    const result = classifyQuery(query);

    expect(result.mode).toBe("bm25");
    expect(result.confidence).toBe(0.8);
  });

  it("classifies a 2-6 char pure Korean query as bm25", () => {
    const result = classifyQuery("인공지능"); // 4 pure-Korean chars

    expect(result.mode).toBe("bm25");
    expect(result.confidence).toBe(0.8);
  });

  it("classifies a query with both graph and vector keywords (longer than 8 chars) as hybrid", () => {
    const query = "두 사람의 관계와 장면 묘사를 자세히 알려주세요"; // "관계" (graph) + "장면"/"묘사" (vector)

    expect(query.trim().length).toBeGreaterThan(8);

    const result = classifyQuery(query);

    expect(result.mode).toBe("hybrid");
    expect(result.confidence).toBe(0.6);
  });

  describe("graph-only keywords", () => {
    it("returns confidence 0.65 for a single graph keyword match", () => {
      const query = "주인공의 가족 사정에 대해 설명해주세요"; // only "가족" matches

      expect(query.trim().length).toBeGreaterThan(8);

      const result = classifyQuery(query);

      expect(result.mode).toBe("graph");
      expect(result.confidence).toBeCloseTo(0.65);
    });

    it("caps confidence at 0.95 once enough graph keywords match", () => {
      // "세력", "동맹", "가족", "친구" -> 4 matches: min(0.5 + 4*0.15, 0.95) = 0.95
      const query = "여러 세력과 동맹을 맺은 가족과 친구들의 이야기를 정리해줘";

      expect(query.trim().length).toBeGreaterThan(8);

      const result = classifyQuery(query);

      expect(result.mode).toBe("graph");
      expect(result.confidence).toBe(0.95);
    });
  });

  describe("vector-only keywords", () => {
    it("returns confidence 0.65 for a single vector keyword match", () => {
      const query = "이 장면의 전체적인 흐름을 설명해주세요"; // only "장면" matches

      expect(query.trim().length).toBeGreaterThan(8);

      const result = classifyQuery(query);

      expect(result.mode).toBe("vector");
      expect(result.confidence).toBeCloseTo(0.65);
    });

    it("caps confidence at 0.95 once enough vector keywords match", () => {
      // "분위기", "느낌", "톤", "장면", "묘사" -> 5 matches, capped at 0.95
      const query = "분위기와 느낌 그리고 톤을 잘 살려서 장면을 묘사해줘";

      expect(query.trim().length).toBeGreaterThan(8);

      const result = classifyQuery(query);

      expect(result.mode).toBe("vector");
      expect(result.confidence).toBe(0.95);
    });
  });

  it("defaults to vector with confidence 0.5 for a long query with no keywords", () => {
    const query = "오늘 날씨가 정말 좋아서 산책을 다녀왔습니다 기분이 상쾌해요";

    expect(query.trim().length).toBeGreaterThan(8);

    const result = classifyQuery(query);

    expect(result.mode).toBe("vector");
    expect(result.confidence).toBe(0.5);
  });

  it("trims surrounding whitespace before classifying", () => {
    // Untrimmed length is 10 (3 leading + 4 content + 3 trailing spaces), but
    // the trimmed content "가족가족" is only 4 chars -> should hit the short
    // bm25 branch based on the trimmed value, not the raw length.
    const raw = "   가족가족   ";

    const result = classifyQuery(raw);

    expect(result.mode).toBe("bm25");
    expect(result.confidence).toBe(0.8);
  });
});

describe("selectModes", () => {
  function classification(
    mode: QueryClassification["mode"]
  ): QueryClassification {
    return { mode, confidence: 1, reasoning: "test" };
  }

  it("maps hybrid to [graph, vector, bm25]", () => {
    expect(selectModes(classification("hybrid"))).toEqual([
      "graph",
      "vector",
      "bm25",
    ]);
  });

  it("maps graph to [graph, bm25]", () => {
    expect(selectModes(classification("graph"))).toEqual(["graph", "bm25"]);
  });

  it("maps vector to [vector, bm25]", () => {
    expect(selectModes(classification("vector"))).toEqual(["vector", "bm25"]);
  });

  it("maps bm25 to [bm25]", () => {
    expect(selectModes(classification("bm25"))).toEqual(["bm25"]);
  });
});
