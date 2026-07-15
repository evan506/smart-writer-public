import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROMPT_BLOCK_CHAR_CAP,
  renderPromptBlock,
  resolveLayeredRules,
  summarizeAppliedMemory,
} from "@/lib/services/extraction-memory/resolve";
import type { MemoryRule } from "@/lib/services/extraction-memory/types";

function rule(partial: Partial<MemoryRule> & { key: string }): MemoryRule {
  return {
    text: partial.text ?? `text-${partial.key}`,
    kind: partial.kind ?? "EXCLUDE_PATTERN",
    layer: partial.layer ?? "project",
    source: partial.source ?? "DISTILLED",
    key: partial.key,
  };
}

describe("resolveLayeredRules", () => {
  it("keeps project and genre rules with distinct keys", () => {
    const result = resolveLayeredRules({
      project: [rule({ key: "p1", layer: "project" })],
      genre: [rule({ key: "g1", layer: "genre", source: "CURATED" })],
    });
    expect(result.map((r) => r.key).sort()).toEqual(["g1", "p1"]);
  });

  it("lets a project rule override a genre rule with the same key", () => {
    const result = resolveLayeredRules({
      project: [rule({ key: "shared", layer: "project", text: "project wins" })],
      genre: [
        rule({ key: "shared", layer: "genre", source: "CURATED", text: "genre" }),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0].layer).toBe("project");
    expect(result[0].text).toBe("project wins");
  });

  it("drops a genre rule whose key is disabled for the project", () => {
    const result = resolveLayeredRules(
      {
        project: [rule({ key: "p1", layer: "project" })],
        genre: [rule({ key: "g1", layer: "genre", source: "CURATED" })],
      },
      new Set(["g1"])
    );
    expect(result.map((r) => r.key)).toEqual(["p1"]);
  });

  it("orders project rules before genre rules", () => {
    const result = resolveLayeredRules({
      project: [rule({ key: "p1", layer: "project" })],
      genre: [rule({ key: "g1", layer: "genre", source: "CURATED" })],
    });
    expect(result[0].layer).toBe("project");
    expect(result[1].layer).toBe("genre");
  });
});

describe("renderPromptBlock", () => {
  it("returns empty string when there is nothing to inject", () => {
    expect(renderPromptBlock([], [])).toEqual({ text: "", truncated: false });
  });

  it("includes the header, rule labels, and excluded names", () => {
    const { text, truncated } = renderPromptBlock(
      [
        rule({ key: "ex", kind: "EXCLUDE_PATTERN", text: "불특정 인물 제외" }),
        rule({ key: "ty", kind: "TYPE_CONVENTION", text: "게이트는 장소" }),
      ],
      ["무명 병사"]
    );
    expect(text).toContain("[추출 학습 메모리]");
    expect(text).toContain("(제외) 불특정 인물 제외");
    expect(text).toContain("(분류) 게이트는 장소");
    expect(text).toContain("이미 제외하기로 한 이름: 무명 병사");
    expect(truncated).toBe(false);
  });

  it("truncates and flags when rules exceed the char cap", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      rule({ key: `k${i}`, text: `아주 긴 추출 규칙 텍스트 항목 번호 ${i} 입니다` })
    );
    const { text, truncated } = renderPromptBlock(many, [], 200);
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(200);
  });

  it("fits as many excluded names as the cap allows", () => {
    const names = Array.from({ length: 40 }, (_, i) => `이름${i}`);
    const { text, truncated } = renderPromptBlock([], names, 120);
    expect(text).toContain("이미 제외하기로 한 이름:");
    expect(truncated).toBe(true);
    expect(text.length).toBeLessThanOrEqual(120);
  });

  it("uses the default cap when none is provided", () => {
    const many = Array.from({ length: 200 }, (_, i) =>
      rule({ key: `k${i}`, text: `규칙 ${i} 의 긴 설명 텍스트입니다` })
    );
    const { text } = renderPromptBlock(many, []);
    expect(text.length).toBeLessThanOrEqual(DEFAULT_PROMPT_BLOCK_CHAR_CAP);
  });
});

describe("summarizeAppliedMemory", () => {
  it("counts rules by layer and reports name + truncation state", () => {
    const summary = summarizeAppliedMemory(
      [
        rule({ key: "p1", layer: "project" }),
        rule({ key: "p2", layer: "project" }),
        rule({ key: "g1", layer: "genre", source: "CURATED" }),
      ],
      ["a", "b"],
      true
    );
    expect(summary.totalRules).toBe(3);
    expect(summary.byLayer.project).toBe(2);
    expect(summary.byLayer.genre).toBe(1);
    expect(summary.byLayer.account).toBe(0);
    expect(summary.excludeNameCount).toBe(2);
    expect(summary.truncated).toBe(true);
  });
});
