import { describe, expect, it } from "vitest";
import {
  normalizeRuleKey,
  prepareDistilledRules,
  referencesApprovedEntity,
} from "@/lib/services/extraction-memory/distillation";

describe("normalizeRuleKey", () => {
  it("lowercases and collapses punctuation/space to underscores", () => {
    expect(normalizeRuleKey("Unspecified Individual!")).toBe(
      "unspecified_individual"
    );
    expect(normalizeRuleKey("  회상 속 인물  ")).toBe("회상_속_인물");
  });

  it("trims leading/trailing separators and caps length", () => {
    expect(normalizeRuleKey("---abc---")).toBe("abc");
    expect(normalizeRuleKey("x".repeat(100)).length).toBeLessThanOrEqual(64);
  });
});

describe("referencesApprovedEntity", () => {
  it("flags a rule text containing an approved entity name", () => {
    expect(referencesApprovedEntity("카이는 제외한다", ["카이", "세나"])).toBe(
      true
    );
  });

  it("ignores generic patterns with no entity name", () => {
    expect(
      referencesApprovedEntity("이름이 없는 불특정 인물은 제외", ["카이"])
    ).toBe(false);
  });

  it("ignores single-character approved names to avoid false positives", () => {
    expect(referencesApprovedEntity("불특정 인물 제외", ["인"])).toBe(false);
  });
});

describe("prepareDistilledRules", () => {
  const opts = { approvedEntityNames: ["카이"], existingKeys: new Set<string>() };

  it("accepts generic rules as DISABLED proposals", () => {
    const { accepted } = prepareDistilledRules(
      [{ key: "flashback_dupe", text: "회상 속 인물 중복 제외" }],
      opts
    );
    expect(accepted).toHaveLength(1);
    expect(accepted[0]).toMatchObject({
      kind: "EXCLUDE_PATTERN",
      source: "DISTILLED",
      status: "DISABLED",
      key: "flashback_dupe",
    });
  });

  it("rejects rules referencing an approved entity", () => {
    const { accepted, rejected } = prepareDistilledRules(
      [{ text: "카이는 추출하지 않음" }],
      opts
    );
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toBe("references_approved_entity");
  });

  it("dedups against existing keys and within the batch", () => {
    const { accepted, rejected } = prepareDistilledRules(
      [
        { key: "dupe", text: "규칙 A" },
        { key: "dupe", text: "규칙 A 중복" },
      ],
      { approvedEntityNames: [], existingKeys: new Set(["other"]) }
    );
    // first accepted, second is a within-batch duplicate
    expect(accepted).toHaveLength(1);
    expect(rejected.some((r) => r.reason === "duplicate")).toBe(true);
  });

  it("skips rules whose key already exists", () => {
    const { accepted, rejected } = prepareDistilledRules(
      [{ key: "existing", text: "규칙" }],
      { approvedEntityNames: [], existingKeys: new Set(["existing"]) }
    );
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toBe("duplicate");
  });

  it("caps the number of accepted proposals", () => {
    const candidates = Array.from({ length: 8 }, (_, i) => ({
      key: `k${i}`,
      text: `규칙 ${i}`,
    }));
    const { accepted, rejected } = prepareDistilledRules(candidates, {
      approvedEntityNames: [],
      existingKeys: new Set(),
      cap: 3,
    });
    expect(accepted).toHaveLength(3);
    expect(rejected.filter((r) => r.reason === "over_cap")).toHaveLength(5);
  });

  it("drops empty rule text", () => {
    const { accepted, rejected } = prepareDistilledRules(
      [{ text: "   " }],
      opts
    );
    expect(accepted).toHaveLength(0);
    expect(rejected[0].reason).toBe("empty");
  });
});
