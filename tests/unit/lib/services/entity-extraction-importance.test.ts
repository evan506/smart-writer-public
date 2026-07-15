import { describe, expect, it } from "vitest";
import { resolveEntityImportance } from "@/lib/services/entity-extraction/importance";

describe("entity extraction importance", () => {
  it("classifies main entities by relation or chapter count", () => {
    expect(resolveEntityImportance(5, 0)).toBe("MAIN");
    expect(resolveEntityImportance(0, 5)).toBe("MAIN");
  });

  it("classifies supporting entities before minor entities", () => {
    expect(resolveEntityImportance(2, 0)).toBe("SUPPORTING");
    expect(resolveEntityImportance(0, 2)).toBe("SUPPORTING");
    expect(resolveEntityImportance(1, 1)).toBe("MINOR");
  });
});
