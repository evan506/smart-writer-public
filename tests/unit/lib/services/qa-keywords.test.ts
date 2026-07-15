import { describe, expect, it } from "vitest";
import { extractContentKeywords, extractKeywordSnippet } from "@/lib/services/qa-keywords";

describe("extractContentKeywords", () => {
  it("strips josa/question words and keeps content keywords", () => {
    const keywords = extractContentKeywords("리엔이 좌천된 이유는 무엇인가요?");

    expect(keywords).toContain("리엔");
    expect(keywords).toContain("좌천된");
    expect(keywords).not.toContain("이유는");
    expect(keywords).not.toContain("이유");
    expect(keywords).not.toContain("무엇인가요");
    expect(keywords).not.toContain("무엇");
  });

  it("strips question words/josa down to the subject term", () => {
    expect(extractContentKeywords("리켈은 누구인가요?")).toEqual(["리켈"]);
  });

  it("dedups tokens that collapse to the same keyword after stripping and sorts longest-first", () => {
    const keywords = extractContentKeywords("리켈이 리켈을 만났다");

    // "만났다" also emits its last-syllable-dropped stem "만났" for
    // inflection-tolerant snippet matching (codex review P2).
    expect(keywords).toEqual(["만났다", "리켈", "만났"]);
  });

  it("drops tokens shorter than 2 characters after stripping", () => {
    const keywords = extractContentKeywords("그가 강하다");

    expect(keywords).not.toContain("그");
    expect(keywords).not.toContain("그가");
    expect(keywords).toContain("강하다");
  });
});

describe("extractKeywordSnippet", () => {
  it("returns content as-is when shorter than the window", () => {
    const content = "  짧은 내용입니다  ";

    expect(extractKeywordSnippet(content, ["아무거나"], 400)).toBe("짧은 내용입니다");
  });

  it("windows around the first keyword hit with ellipsis on both sides when it is mid-content", () => {
    const content = `${"A".repeat(300)}키워드${"B".repeat(300)}`;

    const snippet = extractKeywordSnippet(content, ["키워드"], 400);

    expect(snippet).toContain("키워드");
    expect(snippet.startsWith("...")).toBe(true);
    expect(snippet.endsWith("...")).toBe(true);
  });

  it("falls back to a head slice with a trailing ellipsis when no keyword matches", () => {
    const content = "X".repeat(500);

    const snippet = extractKeywordSnippet(content, ["없는키워드"], 400);

    expect(snippet).toBe(`${"X".repeat(400)}...`);
  });
});
