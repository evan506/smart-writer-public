import { describe, expect, it, vi } from "vitest";
import { runEval } from "@/lib/services/extraction-eval/runner";
import type { GoldenScenario } from "@/lib/services/extraction-eval/types";

const scenarios: GoldenScenario[] = [
  {
    id: "s1",
    source: "test",
    chapterText: "리겔이 등장했다.",
    shouldExtract: ["리겔"],
    shouldNotExtract: ["무명 병사"],
  },
  {
    id: "s2",
    source: "test",
    chapterText: "리엔가 등장했다.",
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
      text.includes("리겔") ? { names: ["리겔"] } : { names: ["리엔"] }
    );
    const run = await runEval({ ...base(), extract });

    expect(run.results.map((r) => r.scenarioId)).toEqual(["s1", "s2"]);
    expect(run.results.every((r) => r.score === 100)).toBe(true);
    expect(run.aggregate.meanScore).toBe(100);
    expect(run.aggregate.environmentFailures).toBe(0);
  });

  it("records a thrown extraction as an environment failure, not a product fail", async () => {
    const extract = vi.fn(async (text: string) => {
      if (text.includes("리겔")) throw new Error("LLM timeout");
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
      text.includes("리겔")
        ? { names: ["리겔", "무명 병사"] } // false positive
        : { names: ["리엔"] }
    );
    const run = await runEval({ ...base(), extract });
    const s1 = run.results.find((r) => r.scenarioId === "s1")!;
    expect(s1.fp).toBe(1);
    expect(s1.score).toBeLessThan(100);
  });
});

it("bounded run stops on first failure and leaves later cases unexecuted", async () => {
  const extract = vi.fn().mockRejectedValue(new Error("parse failure"));
  const run = await runEval({ ...base(), extract, stopOnFailure: true });
  expect(extract).toHaveBeenCalledTimes(1);
  expect(run.status).toBe("aborted");
  expect(run.results).toHaveLength(1);
  expect(run.unexecutedScenarioIds).toEqual(["s2"]);
});

it("bounded run checks stop before scheduling a case", async () => {
  const extract = vi.fn();
  const run = await runEval({ ...base(), extract, shouldStop: () => "budget stop" });
  expect(extract).not.toHaveBeenCalled();
  expect(run.results).toHaveLength(0);
  expect(run.unexecutedScenarioIds).toEqual(["s1", "s2"]);
  expect(run.status).toBe("aborted");
});

it("empty error messages still mark a bounded run aborted", async () => {
  const extract = vi.fn().mockRejectedValue(new Error(""));
  const run = await runEval({ ...base(), extract, stopOnFailure: true });
  expect(run.status).toBe("aborted");
  expect(run.unexecutedScenarioIds).toEqual(["s2"]);
});

it("returned empty failure reason still aborts", async () => {
  const extract = vi.fn().mockResolvedValue({ names: [], environmentFailure: true, error: "" });
  const run = await runEval({ ...base(), extract, stopOnFailure: true });
  expect(run.status).toBe("aborted");
  expect(extract).toHaveBeenCalledTimes(1);
  expect(run.unexecutedScenarioIds).toEqual(["s2"]);
});
