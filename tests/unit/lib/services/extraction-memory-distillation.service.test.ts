import { describe, expect, it, vi } from "vitest";
import {
  MIN_DISMISSALS_FOR_DISTILLATION,
  parseDistillationResponse,
  runExtractionDistillation,
  type DistillationDeps,
} from "@/lib/services/extraction-memory/distillation.service";

describe("parseDistillationResponse", () => {
  it("parses a fenced JSON array", () => {
    const raw = '```json\n[{"key":"a","text":"규칙 A"}]\n```';
    expect(parseDistillationResponse(raw)).toEqual([
      { key: "a", text: "규칙 A" },
    ]);
  });

  it("parses a bare array with surrounding prose", () => {
    const raw = '여기 결과입니다: [{"text":"규칙"}] 끝';
    expect(parseDistillationResponse(raw)).toEqual([
      { key: undefined, text: "규칙" },
    ]);
  });

  it("returns empty on invalid or empty input", () => {
    expect(parseDistillationResponse("")).toEqual([]);
    expect(parseDistillationResponse("not json")).toEqual([]);
    expect(parseDistillationResponse("[broken")).toEqual([]);
  });

  it("drops entries without text", () => {
    const raw = '[{"key":"a"},{"text":"  "},{"text":"ok"}]';
    expect(parseDistillationResponse(raw)).toEqual([
      { key: undefined, text: "ok" },
    ]);
  });
});

function deps(overrides: Partial<DistillationDeps> = {}): DistillationDeps {
  return {
    loadRecentDismissedNames: vi.fn(async () =>
      Array.from({ length: MIN_DISMISSALS_FOR_DISTILLATION }, (_, i) => `이름${i}`)
    ),
    loadApprovedEntityNames: vi.fn(async () => ["카이"]),
    loadExistingRuleKeys: vi.fn(async () => new Set<string>()),
    proposeRules: vi.fn(async () => '[{"key":"flashback","text":"회상 중복 제외"}]'),
    insertProposals: vi.fn(async () => ({ inserted: 1, error: null })),
    ...overrides,
  };
}

describe("runExtractionDistillation", () => {
  it("skips when there are too few dismissals", async () => {
    const d = deps({
      loadRecentDismissedNames: vi.fn(async () => ["a", "b"]),
    });
    const outcome = await runExtractionDistillation("p1", d);
    expect(outcome).toEqual({
      proposed: 0,
      skippedReason: "too_few_dismissals",
      error: null,
    });
    expect(d.proposeRules).not.toHaveBeenCalled();
  });

  it("proposes and inserts validated rules", async () => {
    const d = deps();
    const outcome = await runExtractionDistillation("p1", d);
    expect(outcome).toEqual({ proposed: 1, error: null });
    expect(d.insertProposals).toHaveBeenCalledOnce();
  });

  it("skips when the LLM returns no usable patterns", async () => {
    const d = deps({ proposeRules: vi.fn(async () => "[]") });
    const outcome = await runExtractionDistillation("p1", d);
    expect(outcome.skippedReason).toBe("no_patterns");
    expect(d.insertProposals).not.toHaveBeenCalled();
  });

  it("rejects a proposal that references an approved entity", async () => {
    const d = deps({
      proposeRules: vi.fn(async () => '[{"text":"카이는 제외"}]'),
    });
    const outcome = await runExtractionDistillation("p1", d);
    expect(outcome.skippedReason).toBe("no_patterns");
  });

  it("returns an error when the LLM call throws", async () => {
    const d = deps({
      proposeRules: vi.fn(async () => {
        throw new Error("LLM down");
      }),
    });
    const outcome = await runExtractionDistillation("p1", d);
    expect(outcome.error).toBe("LLM down");
    expect(outcome.proposed).toBe(0);
  });
});
