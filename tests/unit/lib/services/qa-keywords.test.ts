import { describe, expect, it } from "vitest";
import { extractContentKeywords, extractKeywordSnippet } from "@/lib/services/qa-keywords";

describe("extractContentKeywords", () => {
  it("strips josa/question words and keeps content keywords", () => {
    const keywords = extractContentKeywords("리엔가 좌천된 이유는 무엇인가요?");

    expect(keywords).toContain("리엔");
    expect(keywords).toContain("좌천된");
    expect(keywords).not.toContain("이유는");
    expect(keywords).not.toContain("이유");
    expect(keywords).not.toContain("무엇인가요");
    expect(keywords).not.toContain("무엇");
  });

  it("strips question words/josa down to the subject term", () => {
    expect(extractContentKeywords("세란은 누구인가요?")).toEqual(["세란"]);
  });

  it("dedups tokens that collapse to the same keyword after stripping and sorts longest-first", () => {
    const keywords = extractContentKeywords("세란이 세란을 만났다");

    // "만났다" also emits its last-syllable-dropped stem "만났" for
    // inflection-tolerant snippet matching (codex review P2).
    expect(keywords).toEqual(["만났다", "세란", "만났"]);
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


describe("QA-only retrieval options", () => {
  it("omits artificial stems only when requested, preserving punctuation and negation tokens", () => {
    const question = "튀르아의 늑대 권속은 등장하나요？！ 완전히 회복하지 않았다.";
    const base = extractContentKeywords(question, { includeStems: false });
    expect(base).toContain("튀르아");
    expect(base).not.toContain("튀르");
    expect(base).toContain("회복하지");
    expect(base).toContain("않았다");
    expect(extractContentKeywords(question)).toContain("튀르");
    expect(extractContentKeywords("？！", { includeStems: false })).toEqual([]);
  });

  it("preserves the seed position and includes the later outcome within 800 characters", () => {
    const content = `${"A".repeat(300)}각성${"B".repeat(300)}마력은 미약했다. 다른 변화는 없었다.${"C".repeat(700)}`;
    const seed = extractKeywordSnippet(content, ["각성"]);
    const extended = extractKeywordSnippet(content, ["각성"], 400, { extendTail: true });
    expect(seed).not.toContain("다른 변화는 없었다");
    expect(extended).toContain("마력은 미약했다. 다른 변화는 없었다.");
    const body = extended.slice(3, -3);
    expect(body).toHaveLength(800);
    expect(content).toContain(body);
    expect(extended.startsWith(seed.slice(0, -3))).toBe(true);
    expect(extractKeywordSnippet(content, ["각성"])).toBe(seed);
  });

  it("stops the appended tail at a scene boundary", () => {
    const content = `${"A".repeat(300)}각성${"B".repeat(300)}결과*****다음 장면${"C".repeat(700)}`;
    const extended = extractKeywordSnippet(content, ["각성"], 400, { extendTail: true });
    expect(extended).toContain("결과");
    expect(extended).not.toContain("*****");
    expect(extended).not.toContain("다음 장면");
  });

  it("does not extend a seed already crossing a scene or a no-match fallback", () => {
    const content = `${"A".repeat(300)}각성*****${"B".repeat(1000)}`;
    expect(extractKeywordSnippet(content, ["각성"], 400, { extendTail: true }))
      .toBe(extractKeywordSnippet(content, ["각성"]));
    expect(extractKeywordSnippet(content, ["없는말"], 400, { extendTail: true }))
      .toBe(extractKeywordSnippet(content, ["없는말"]));
  });

  it("handles the document end and short documents without inventing text", () => {
    const content = `${"A".repeat(300)}각성${"B".repeat(300)}끝`;
    const extended = extractKeywordSnippet(content, ["각성"], 400, { extendTail: true });
    expect(extended).toBe(`...${content.slice(100)}`);
    expect(extractKeywordSnippet(" 짧은 각성 ", ["각성"], 400, { extendTail: true })).toBe("짧은 각성");
  });
});

 describe("QA scene context and named cooccurrence", () => {
  it("recovers a nearby opening without dropping the existing outcome", () => {
    const content = `${"이전".repeat(150)}*****\n호수에서 목욕했다.${"B".repeat(270)}서아${"C".repeat(100)}보초를 섰다.`;
    const before = extractKeywordSnippet(content, ["서아"], 400, { extendTail: true });
    const after = extractKeywordSnippet(content, ["서아"], 400, { extendTail: true, includeSceneStart: true });
    expect(before).not.toContain("호수에서 목욕했다");
    expect(after).toContain("호수에서 목욕했다");
    expect(after).toContain(before.slice(3));
    expect(after).not.toContain("*****");
    expect(after).not.toContain("이전");
  });

  it("never spends the existing 800-character outcome on an opening", () => {
    const content = `호수${"A".repeat(280)}서아${"B".repeat(550)}뒤쪽 결론${"C".repeat(500)}`;
    const before = extractKeywordSnippet(content, ["서아"], 400, { extendTail: true });
    expect(before).toContain("뒤쪽 결론");
    expect(extractKeywordSnippet(content, ["서아"], 400, { extendTail: true, includeSceneStart: true })).toBe(before);
  });

  it("prioritizes name-centered shared context without changing default snippets", () => {
    const content = `${"A".repeat(300)}날개 하피${"B".repeat(500)}서아${"C".repeat(50)}민호${"D".repeat(210)}결말은 부정됐다.${"E".repeat(500)}`;
    const keywords = ["날개", "하피", "서아", "민호"];
    const before = extractKeywordSnippet(content, keywords, 400, { extendTail: true });
    const after = extractKeywordSnippet(content, keywords, 400, { extendTail: true, mentionedNames: ["서아", "민호", "서아"] });
    expect(before).not.toContain("결말은 부정됐다");
    expect(after).toContain("결말은 부정됐다");
    const body = after.replace(/^\.\.\.|\.\.\.$/g, "");
    expect(body.length).toBeLessThanOrEqual(800);
    expect(content).toContain(body);
    expect(extractKeywordSnippet(content, keywords, 400, { extendTail: true })).toBe(before);
  });

  it("does not count a scene-crossing name pair or duplicate name as joint context", () => {
    const content = `${"A".repeat(300)}서아*****민호${"B".repeat(700)}`;
    for (const names of [["서아", "민호"], ["서아", "서아"], ["없는이름", "민호"]]) {
      expect(extractKeywordSnippet(content, ["서아", "민호"], 400, { extendTail: true, mentionedNames: names }))
        .toBe(extractKeywordSnippet(content, ["서아", "민호"], 400, { extendTail: true }));
    }
  });

  it("chooses the earliest equal name candidate independent of keyword order", () => {
    const content = `${"A".repeat(300)}서아 민호${"B".repeat(800)}민호 서아${"C".repeat(800)}`;
    const a = extractKeywordSnippet(content, ["서아", "민호"], 400, { extendTail: true, mentionedNames: ["서아", "민호"] });
    const b = extractKeywordSnippet(content, ["민호", "서아"], 400, { extendTail: true, mentionedNames: ["민호", "서아"] });
    expect(a).toBe(b);
    expect(a).toContain(content.slice(300, 500));
  });
});
