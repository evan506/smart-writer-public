import { describe, expect, it } from "vitest";
import {
  attachFallbackContextSnippets,
  extractCoOccurrenceSnippets,
  extractContextSnippets,
  extractClassificationContextSnippets,
} from "@/lib/services/entity-extraction/snippet-policy";

describe("entity extraction snippet policy", () => {
  it("keeps roleplay explanations and replies after emphatic dialogue", () => {
    const source = '"구름의 왕이 이겼다!" 아이들의 소꿉놀이였다. "호루!" "네, 대장님!" 호루가 대답했다.';
    expect(extractClassificationContextSnippets(source, "구름의 왕")[0]).toContain("아이들의 소꿉놀이였다.");
    expect(extractClassificationContextSnippets(source, "호루")[0]).toContain('"네, 대장님!" 호루가 대답했다.');
  });

  it("keeps the name list and its remembering subject together", () => {
    const source = '세린은 중얼거렸다. "미라, 토란, 하누." 그는 저택의 메이드들 이름을 외우고 있었다. 미라는 사서가 아니었다.';
    const [snippet] = extractClassificationContextSnippets(source, "세린");
    expect(snippet).toContain('"미라, 토란, 하누."');
    expect(snippet).toContain("그는 저택의 메이드들 이름을 외우고 있었다.");
  });

  it("preserves directly stated positive settings and epistemic qualifiers", () => {
    const source = '하린은 엘프였다. 그는 북문 서고의 사서로 일한다. "아마 누리가 기적을 일으켰을지도 몰라." 세린의 추측이었다.';
    const [snippet] = extractClassificationContextSnippets(source, "하린");
    expect(snippet).toContain("하린은 엘프였다.");
    expect(snippet).toContain("북문 서고의 사서로 일한다.");
    expect(extractClassificationContextSnippets(source, "누리")[0]).toContain("세린의 추측이었다.");
  });

  it("never crosses scene boundaries, including when the name repeats", () => {
    const source = "이전비밀. ***** 세린이 나타났다. ***** 다음비밀. 세린이 떠났다.";
    const snippets = extractClassificationContextSnippets(source, "세린");
    expect(snippets).toEqual(["세린이 나타났다.", "다음비밀. 세린이 떠났다."]);
    expect(snippets.every((snippet) => !snippet.includes("*****"))).toBe(true);
  });

  it("bounds long sentences without losing a candidate near either end", () => {
    for (const source of ["세린" + "가".repeat(2000), "가".repeat(2000) + "세린", "가".repeat(1000) + "세린" + "나".repeat(1000)]) {
      const snippets = extractClassificationContextSnippets(source, "세린");
      expect(snippets).toHaveLength(1);
      expect(snippets[0]).toContain("세린");
      expect(snippets[0].length).toBeLessThanOrEqual(600);
      expect(source).toContain(snippets[0]);
    }
  });

  it("adds at most 200 characters per side and deduplicates in source order", () => {
    const source = "가".repeat(400) + ". 세린이 왔다. " + "나".repeat(400) + ". 세린이 떠났다. " + "다".repeat(400) + ". 세린이 웃었다.";
    const snippets = extractClassificationContextSnippets(source, "세린");
    expect(snippets).toHaveLength(2);
    expect(source.indexOf(snippets[0])).toBeLessThan(source.indexOf(snippets[1]));
    expect(snippets[0].match(/^가*/)?.[0].length).toBeLessThanOrEqual(200);
    expect(snippets[0].match(/나*$/)?.[0].length).toBeLessThanOrEqual(200);
    expect(snippets.every((snippet) => snippet.length <= 600 && source.includes(snippet))).toBe(true);
    expect(extractClassificationContextSnippets("세린 세린 세린.", "세린")).toEqual(["세린 세린 세린."]);
  });

  it("returns exact whitespace-normalized source substrings and handles absent names", () => {
    const source = "세린은\n\n 북문에 섰다.\t미라가 왔다!";
    const normalized = source.replace(/\s+/g, " ").trim();
    expect(extractClassificationContextSnippets(source, "세린")).toEqual([normalized]);
    expect(extractClassificationContextSnippets(source, "없는 이름")).toEqual([]);
    expect(extractClassificationContextSnippets(source, "")).toEqual([]);
    expect(extractClassificationContextSnippets("", "세린")).toEqual([]);
    expect(extractClassificationContextSnippets("가".repeat(601), "가".repeat(601))).toEqual([]);
  });

  it("extracts source sentences for candidate evidence", () => {
    const result = extractContextSnippets(
      "세란은 북문 시장에 섰다. 아이들은 세란을 은빛 까마귀라고 불렀다. 은빛 까마귀는 대답하지 않았다.",
      "은빛 까마귀"
    );

    expect(result).toEqual([
      "아이들은 세란을 은빛 까마귀라고 불렀다.",
      "은빛 까마귀는 대답하지 않았다.",
    ]);
  });

  it("preserves classified snippets and falls back to source snippets when missing", () => {
    const result = attachFallbackContextSnippets(
      [
        {
          name: "은빛 까마귀",
          type: "CHARACTER",
          context_snippet: "",
        },
        {
          name: "세란",
          type: "CHARACTER",
          context_snippet: "세란은 성문 앞에서 아이들을 지켰다.",
        },
        {
          name: "없는 후보",
          type: "PLACE",
        },
      ],
      new Map([
        ["은빛 까마귀", "은빛 까마귀라는 이름도 속삭였다."],
        ["세란", "fallback should not replace existing evidence"],
      ])
    );

    expect(result).toEqual([
      {
        name: "은빛 까마귀",
        type: "CHARACTER",
        context_snippet: "은빛 까마귀라는 이름도 속삭였다.",
      },
      {
        name: "세란",
        type: "CHARACTER",
        context_snippet: "세란은 성문 앞에서 아이들을 지켰다.",
      },
      {
        name: "없는 후보",
        type: "PLACE",
        context_snippet: "",
      },
    ]);
  });

  it("filters stage 3 character co-occurrence snippets without durable relation evidence", () => {
    const result = extractCoOccurrenceSnippets(
      "리엔와 미라는 같은 방에 있었다. 게일은 검은 서고에서 리엔를 기다렸다.",
      [
        { name: "리엔", type: "CHARACTER" },
        { name: "미라", type: "CHARACTER" },
        { name: "검은 서고", type: "PLACE" },
      ],
      { range: 80 }
    );

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nameA: "리엔",
          nameB: "검은 서고",
        }),
      ])
    );
    expect(result).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nameA: "리엔",
          nameB: "미라",
        }),
      ])
    );
  });

  it("keeps stage 3 character co-occurrence snippets with explicit relation evidence", () => {
    const result = extractCoOccurrenceSnippets(
      "리엔와 미라는 함께 마족에게 맞서 싸웠다.",
      [
        { name: "리엔", type: "CHARACTER" },
        { name: "미라", type: "CHARACTER" },
      ]
    );

    expect(result).toEqual([
      {
        nameA: "리엔",
        nameB: "미라",
        snippet: "리엔와 미라는 함께 마족에게 맞서 싸웠다.",
      },
    ]);
  });
});
