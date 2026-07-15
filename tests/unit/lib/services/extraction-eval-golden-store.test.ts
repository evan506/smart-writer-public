import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildGoldenScenarios } from "@/lib/services/extraction-eval/golden";
import {
  computeAggregate,
  loadPriorRuns,
  writeRunReport,
} from "@/lib/services/extraction-eval/store";
import { STARTER_GOLDEN_SCENARIOS } from "@/lib/services/extraction-eval/fixtures";
import type { EvalRun, ScenarioResult } from "@/lib/services/extraction-eval/types";

describe("buildGoldenScenarios", () => {
  const chapters = [
    { id: "ch1", chapter_num: 1, content: "카이가 등장했다." },
    { id: "ch2", chapter_num: 2, content: "내용 있음" },
    { id: "ch3", chapter_num: 3, content: "   " }, // empty after trim
  ];

  it("maps confirmed -> shouldExtract and dismissed -> shouldNotExtract", () => {
    const scenarios = buildGoldenScenarios({
      projectId: "p1",
      chapters,
      suggestions: [
        { chapter_id: "ch1", name: "카이", type: "CHARACTER", status: "CONFIRMED" },
        { chapter_id: "ch1", name: "무명 병사", type: "CHARACTER", status: "DISMISSED" },
        { chapter_id: "ch1", name: "카이", type: "CHARACTER", status: "CONFIRMED" }, // dup
      ],
    });
    expect(scenarios).toHaveLength(1);
    expect(scenarios[0]).toMatchObject({
      id: "p1:ch1",
      shouldExtract: ["카이"],
      shouldNotExtract: ["무명 병사"],
    });
  });

  it("excludes RELATION suggestions and unlabeled/empty chapters", () => {
    const scenarios = buildGoldenScenarios({
      projectId: "p1",
      chapters,
      suggestions: [
        { chapter_id: "ch1", name: "A → B", type: "RELATION", status: "CONFIRMED" },
        { chapter_id: "ch2", name: "X", type: "CHARACTER", status: "PENDING" },
        { chapter_id: "ch3", name: "카이", type: "CHARACTER", status: "CONFIRMED" },
      ],
    });
    // ch1 has only a RELATION (ignored), ch2 only PENDING (no label), ch3 empty.
    expect(scenarios).toEqual([]);
  });

  it("starter fixtures are well-formed golden scenarios", () => {
    for (const scenario of STARTER_GOLDEN_SCENARIOS) {
      expect(scenario.chapterText.length).toBeGreaterThan(0);
      expect(
        scenario.shouldExtract.length + scenario.shouldNotExtract.length
      ).toBeGreaterThan(0);
    }
  });
});

function result(score: number, environmentFailure = false): ScenarioResult {
  return {
    scenarioId: "s",
    score,
    precision: 1,
    recall: 1,
    noiseRate: 0,
    tp: 1,
    fp: 0,
    fn: 0,
    falsePositives: [],
    falseNegatives: [],
    environmentFailure,
  };
}

describe("computeAggregate", () => {
  it("averages product results and counts environment failures", () => {
    const agg = computeAggregate([result(80), result(100), result(0, true)]);
    expect(agg.scenarioCount).toBe(3);
    expect(agg.environmentFailures).toBe(1);
    expect(agg.meanScore).toBe(90); // mean(80,100)
  });
});

describe("run store round-trip", () => {
  const dirs: string[] = [];
  function tmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sw-eval-"));
    dirs.push(dir);
    return dir;
  }
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function run(runId: string, startedAt: string): EvalRun {
    const results = [result(90)];
    return {
      runId,
      startedAt,
      tier: "smoke",
      results,
      aggregate: computeAggregate(results),
    };
  }

  it("writes and reads back runs in chronological order", () => {
    const dir = tmpDir();
    writeRunReport(dir, run("a", "2026-06-14T01:00:00.000Z"));
    writeRunReport(dir, run("b", "2026-06-14T02:00:00.000Z"));

    const loaded = loadPriorRuns(dir);
    expect(loaded.map((r) => r.runId)).toEqual(["a", "b"]);
  });

  it("applies a limit to the most recent runs", () => {
    const dir = tmpDir();
    writeRunReport(dir, run("a", "2026-06-14T01:00:00.000Z"));
    writeRunReport(dir, run("b", "2026-06-14T02:00:00.000Z"));
    writeRunReport(dir, run("c", "2026-06-14T03:00:00.000Z"));

    expect(loadPriorRuns(dir, 2).map((r) => r.runId)).toEqual(["b", "c"]);
  });

  it("returns empty for a missing directory and skips malformed files", () => {
    const dir = tmpDir();
    expect(loadPriorRuns(path.join(dir, "nope"))).toEqual([]);
    fs.writeFileSync(path.join(dir, "run-bad.json"), "{not json", "utf8");
    expect(loadPriorRuns(dir)).toEqual([]);
  });
});
