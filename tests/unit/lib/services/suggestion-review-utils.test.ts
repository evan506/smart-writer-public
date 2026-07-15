import { describe, expect, it } from "vitest";
import {
  getConfirmableSuggestionIdsByName,
  getConfirmableSuggestions,
  getSkippedMergeCount,
  isMergeSuggestion,
} from "@/lib/services/suggestion-review-utils";

describe("suggestion-review-utils", () => {
  const suggestions = [
    { id: "new-1", name: "리켈", suggested_action: "CREATE" },
    { id: "alias-1", name: "리켈", suggested_action: "MERGE" },
    { id: "update-1", name: "검은 서고", suggested_action: "UPDATE" },
    { id: "legacy-1", name: "푸른 문" },
  ];

  it("treats MERGE suggestions as author-reviewed alias candidates", () => {
    expect(isMergeSuggestion(suggestions[1])).toBe(true);
    expect(isMergeSuggestion(suggestions[0])).toBe(false);
  });

  it("excludes MERGE suggestions from batch entity confirmation", () => {
    expect(getConfirmableSuggestions(suggestions).map((suggestion) => suggestion.id)).toEqual([
      "new-1",
      "update-1",
      "legacy-1",
    ]);
    expect(getSkippedMergeCount(suggestions)).toBe(1);
  });

  it("does not confirm same-name MERGE suggestions when a new entity is inserted", () => {
    expect(getConfirmableSuggestionIdsByName(suggestions, "리켈")).toEqual(["new-1"]);
  });
});
