import { describe, expect, it, vi } from "vitest";
import { runEval } from "@/lib/services/extraction-eval/runner";
import type { GoldenScenario } from "@/lib/services/extraction-eval/types";

const scenarios: GoldenScenario[] = [
  {
    id: "s1",
    source: "test",
    chapterText: "카이가 등장했다.",
    shouldExtract: ["카이"],
    shouldNotExtract: ["무명 병사"],
  },
  {
    id: "s2",
    source: "test",
    chapterText: "리엔이 등장했다.",
    shouldExtract: ["리엔"],
    shouldNotExtract: [],
  },
];

function base() {
  return {
    scenarios,
    tier: "smoke" as const,
    runId: "run1",
    startedAt: "2026-06-14T00:00:00.000Z",
  };
}

describe("runEval", () => {
  it("scores each scenario from the injected extractor", async () => {
    const extract = vi.fn(async (text: string) =>
      text.includes("카이") ? { names: ["카이"] } : { names: ["리엔"] }
    );
    const run = await runEval({ ...base(), extract });

    expect(run.results.map((r) => r.scenarioId)).toEqual(["s1", "s2"]);
    expect(run.results.every((r) => r.score === 100)).toBe(true);
    expect(run.aggregate.meanScore).toBe(100);
    expect(run.aggregate.environmentFailures).toBe(0);
  });

  it("records a thrown extraction as an environment failure, not a product fail", async () => {
    const extract = vi.fn(async (text: string) => {
      if (text.includes("카이")) throw new Error("LLM timeout");
      return { names: ["리엔"] };
    });
    const run = await runEval({ ...base(), extract });

    const s1 = run.results.find((r) => r.scenarioId === "s1")!;
    expect(s1.environmentFailure).toBe(true);
    expect(s1.error).toBe("LLM timeout");
    // s2 still scored; aggregate means exclude the environment failure.
    expect(run.aggregate.environmentFailures).toBe(1);
    expect(run.aggregate.meanScore).toBe(100);
  });

  it("respects an explicit environmentFailure flag from the extractor", async () => {
    const extract = vi.fn(async () => ({
      names: [],
      environmentFailure: true,
      error: "no api key",
    }));
    const run = await runEval({ ...base(), extract });
    expect(run.results.every((r) => r.environmentFailure)).toBe(true);
  });

  it("penalizes a noisy extractor that surfaces dismissed names", async () => {
    const extract = vi.fn(async (text: string) =>
      text.includes("카이")
        ? { names: ["카이", "무명 병사"] } // false positive
        : { names: ["리엔"] }
    );
    const run = await runEval({ ...base(), extract });
    const s1 = run.results.find((r) => r.scenarioId === "s1")!;
    expect(s1.fp).toBe(1);
    expect(s1.score).toBeLessThan(100);
  });
});
