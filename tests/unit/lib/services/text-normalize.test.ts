import { describe, expect, it } from "vitest";
import {
  normalizeEntityName,
  normalizeLooseName,
} from "@/lib/services/text-normalize";
import { normalizeCodexEntityName } from "@/lib/services/codex-evidence-utils";
import { normalizeName as evalNormalizeName } from "@/lib/services/extraction-eval/scoring";

// Golden contract: three normalization strategies exist on purpose and their
// differences are load-bearing (dedup/merge/matching semantics). If one of
// these assertions fails, a strategy changed — decide deliberately, don't
// just update the expectation.
describe("name normalization strategies", () => {
  it("strict entity identity strips whitespace and lowercases", () => {
    expect(normalizeEntityName("검은 서고")).toBe("검은서고");
    expect(normalizeEntityName("  Lien  Kael ")).toBe("lienkael");
    // Punctuation is kept — "재의 연대기!" is a different strict name
    expect(normalizeEntityName("재의 연대기!")).toBe("재의연대기!");
  });

  it("loose comparison additionally folds NFKC and strips punctuation/symbols", () => {
    expect(normalizeLooseName("재의 연대기!")).toBe("재의연대기");
    expect(normalizeLooseName("'월광'")).toBe("월광");
    // NFKC: full-width latin folds to ascii
    expect(normalizeLooseName("Ｌｉｅｎ")).toBe("lien");
    expect(normalizeLooseName("검은-서고")).toBe("검은서고");
  });

  it("codex evidence matching keeps inner spaces (trim+lower only)", () => {
    expect(normalizeCodexEntityName(" 검은 서고 ")).toBe("검은 서고");
    // The strategies genuinely diverge here — inner space preserved
    expect(normalizeCodexEntityName("검은 서고")).not.toBe(
      normalizeEntityName("검은 서고")
    );
  });

  it("eval scorer's normalizeName stays an alias of the loose strategy", () => {
    for (const sample of ["재의 연대기!", "Ｌｉｅｎ", "검은-서고", "리엔"]) {
      expect(evalNormalizeName(sample)).toBe(normalizeLooseName(sample));
    }
  });
});
