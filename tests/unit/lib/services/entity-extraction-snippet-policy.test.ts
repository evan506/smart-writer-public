import { describe, expect, it } from "vitest";
import {
  attachFallbackContextSnippets,
  extractCoOccurrenceSnippets,
  extractContextSnippets,
} from "@/lib/services/entity-extraction/snippet-policy";

describe("entity extraction snippet policy", () => {
  it("extracts source sentences for candidate evidence", () => {
    const result = extractContextSnippets(
      "리켈은 북문 시장에 섰다. 아이들은 리켈을 은빛 까마귀라고 불렀다. 은빛 까마귀는 대답하지 않았다.",
      "은빛 까마귀"
    );

    expect(result).toEqual([
      "아이들은 리켈을 은빛 까마귀라고 불렀다.",
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
          name: "리켈",
          type: "CHARACTER",
          context_snippet: "리켈은 성문 앞에서 아이들을 지켰다.",
        },
        {
          name: "없는 후보",
          type: "PLACE",
        },
      ],
      new Map([
        ["은빛 까마귀", "은빛 까마귀라는 이름도 속삭였다."],
        ["리켈", "fallback should not replace existing evidence"],
      ])
    );

    expect(result).toEqual([
      {
        name: "은빛 까마귀",
        type: "CHARACTER",
        context_snippet: "은빛 까마귀라는 이름도 속삭였다.",
      },
      {
        name: "리켈",
        type: "CHARACTER",
        context_snippet: "리켈은 성문 앞에서 아이들을 지켰다.",
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
      "리엔과 미라는 같은 방에 있었다. 카일은 검은 서고에서 리엔을 기다렸다.",
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
      "리엔과 미라는 함께 마족에게 맞서 싸웠다.",
      [
        { name: "리엔", type: "CHARACTER" },
        { name: "미라", type: "CHARACTER" },
      ]
    );

    expect(result).toEqual([
      {
        nameA: "리엔",
        nameB: "미라",
        snippet: "리엔과 미라는 함께 마족에게 맞서 싸웠다.",
      },
    ]);
  });
});
