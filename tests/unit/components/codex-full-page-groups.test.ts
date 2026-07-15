import { describe, expect, it } from "vitest";
import { TYPE_GROUPS } from "@/components/codex-full-page/constants";

describe("Codex full page type groups", () => {
  it("keeps item entities in an item group instead of concept grouping", () => {
    const itemGroup = TYPE_GROUPS.find((group) => group.key === "ITEM");
    const otherGroup = TYPE_GROUPS.find((group) => group.key === "OTHER");

    expect(itemGroup?.label).toBe("아이템");
    expect(itemGroup?.types).toContain("ITEM");
    expect(otherGroup?.label).toBe("개념·마법");
    expect(otherGroup?.types).not.toContain("ITEM");
  });
});
