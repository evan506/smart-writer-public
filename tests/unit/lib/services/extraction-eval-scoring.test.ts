import { describe, expect, it } from "vitest";
import {
  mean,
  normalizeName,
  scoreScenario,
} from "@/lib/services/extraction-eval/scoring";

const scenario = {
  shouldExtract: ["카이", "리엔 하르트", "변방 마을"],
  shouldNotExtract: ["무명 병사", "지나가던 상인"],
};

describe("scoreScenario", () => {
  it("scores a perfect extraction at 100", () => {
    const s = scoreScenario(scenario, ["카이", "리엔 하르트", "변방 마을"]);
    expect(s.score).toBe(100);
    expect(s.precision).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.fp).toBe(0);
    expect(s.fn).toBe(0);
  });

  it("penalizes a dismissed name (false positive) more than a miss", () => {
    // One false positive (surfaced a dismissed name).
    const withFp = scoreScenario(scenario, [
      "카이",
      "리엔 하르트",
      "변방 마을",
      "무명 병사",
    ]);
    // One false negative (missed a confirmed name).
    const withFn = scoreScenario(scenario, ["카이", "리엔 하르트"]);

    expect(withFp.fp).toBe(1);
    expect(withFn.fn).toBe(1);
    // Precision-weighting: the false positive should cost more than the miss.
    expect(withFp.score).toBeLessThan(withFn.score);
  });

  it("makes 'extract everything' a losing strategy", () => {
    const everything = scoreScenario(scenario, [
      "카이",
      "리엔 하르트",
      "변방 마을",
      "무명 병사",
      "지나가던 상인",
    ]);
    const careful = scoreScenario(scenario, ["카이", "리엔 하르트", "변방 마을"]);
    // Grabbing both dismissed names tanks precision below the careful extractor.
    expect(everything.precision).toBeLessThan(careful.precision);
    expect(everything.score).toBeLessThan(careful.score);
    expect(everything.noiseRate).toBeCloseTo(2 / 5, 5);
  });

  it("ignores unlabeled names (neither confirmed nor dismissed)", () => {
    const s = scoreScenario(scenario, [
      "카이",
      "리엔 하르트",
      "변방 마을",
      "정체불명 신규 이름",
    ]);
    // Unlabeled name is neither TP nor FP.
    expect(s.tp).toBe(3);
    expect(s.fp).toBe(0);
    expect(s.score).toBe(100);
  });

  it("normalizes names before matching", () => {
    const s = scoreScenario(
      { shouldExtract: ["카이!"], shouldNotExtract: [] },
      ["  카이  "]
    );
    expect(s.tp).toBe(1);
    expect(s.score).toBe(100);
  });

  it("treats empty extraction with confirmed names as full miss", () => {
    const s = scoreScenario(scenario, []);
    expect(s.recall).toBe(0);
    expect(s.score).toBe(0);
  });

  it("handles a scenario with no labels as neutral", () => {
    const s = scoreScenario({ shouldExtract: [], shouldNotExtract: [] }, ["x"]);
    expect(s.precision).toBe(1);
    expect(s.recall).toBe(1);
    expect(s.score).toBe(100);
  });
});

describe("normalizeName", () => {
  it("lowercases, NFKC-normalizes, and strips punctuation/space", () => {
    expect(normalizeName("  카이! ")).toBe("카이");
    expect(normalizeName("Dino Silverud")).toBe("dinosilverud");
  });
});

describe("mean", () => {
  it("averages and returns 0 for empty", () => {
    expect(mean([10, 20, 30])).toBe(20);
    expect(mean([])).toBe(0);
  });
});
