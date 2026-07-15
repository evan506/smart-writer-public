import { describe, expect, it } from "vitest";
import {
  appendExcludedTerm,
  buildEntityBatchConfirmationPlan,
  buildRelationBatchConfirmationPlan,
  getMergeTargetValidationError,
  getInsertedEntitySuggestionIds,
  mergeAliasValues,
  normalizeAlias,
  splitSuggestionsForBatchConfirmation,
} from "@/lib/services/suggestion-action-utils";

describe("suggestion-action-utils", () => {
  it("normalizes and merges aliases without whitespace or case duplicates", () => {
    expect(normalizeAlias("  Black   Library ")).toBe("blacklibrary");
    expect(mergeAliasValues(["검은 서고", "흑 서고"], [" 검은서고 ", "", "흑서고", "밤의 서고"])).toEqual([
      "검은 서고",
      "흑 서고",
      "밤의 서고",
    ]);
  });

  it("builds an entity batch plan that skips MERGE suggestions and dedupes new rows", () => {
    const plan = buildEntityBatchConfirmationPlan(
      [
        {
          id: "existing-1",
          name: "리엔",
          type: "CHARACTER",
          summary: "더 긴 최신 요약",
          aliases: ["검은 기사"],
          suggested_action: "UPDATE",
        },
        {
          id: "new-1",
          name: "검은 서고",
          type: "PLACE",
          summary: "금서가 보관된 장소",
          aliases: ["흑서고"],
          suggested_action: "CREATE",
        },
        {
          id: "new-duplicate",
          name: "검은 서고",
          type: "PLACE",
          summary: "중복 후보",
          aliases: ["밤의 서고"],
          suggested_action: "CREATE",
        },
        {
          id: "merge-1",
          name: "리엔 경",
          type: "CHARACTER",
          summary: null,
          aliases: [],
          suggested_action: "MERGE",
        },
      ],
      [
        {
          id: "entity-1",
          name: "리엔",
          summary: "짧은 요약",
          aliases: ["리엔", "검은기사"],
        },
      ],
      "project-1"
    );

    expect(plan.confirmed).toBe(3);
    expect(plan.skippedMerge).toBe(1);
    expect(plan.existingUpdates).toEqual([
      {
        entityId: "entity-1",
        values: {
          summary: "더 긴 최신 요약",
          aliases: ["리엔", "검은기사"],
        },
      },
    ]);
    expect(plan.statusGroups.get("entity-1")).toEqual(["existing-1"]);
    expect(plan.newRows).toEqual([
      {
        project_id: "project-1",
        name: "검은 서고",
        type: "PLACE",
        summary: "금서가 보관된 장소",
        aliases: ["흑서고"],
        metadata: { importance: "MINOR" },
      },
    ]);
    expect(getInsertedEntitySuggestionIds(plan.confirmableSuggestions, "검은 서고")).toEqual([
      "new-1",
      "new-duplicate",
    ]);
  });

  it("builds a relation batch plan that confirms complete endpoints and dismisses invalid rows", () => {
    const plan = buildRelationBatchConfirmationPlan(
      [
        {
          id: "relation-1",
          aliases: {
            from_name: "리엔",
            to_name: "검은 서고",
            relation_type: "LOCATED_AT",
            direction: "UNI",
            weight: 0.72,
          },
        },
        {
          id: "relation-defaults",
          aliases: {
            from_name: "리엔",
            to_name: "카이",
            relation_type: "ALLY",
            direction: "BI",
          },
        },
        {
          id: "missing-endpoint",
          aliases: {
            from_name: "리엔",
            to_name: "없는 인물",
            relation_type: "ENEMY",
          },
        },
        {
          id: "missing-type",
          aliases: {
            from_name: "리엔",
            to_name: "카이",
          },
        },
      ],
      [
        { id: "entity-1", name: "리엔" },
        { id: "entity-2", name: "검은 서고" },
        { id: "entity-3", name: "카이" },
      ]
    );

    expect(plan.confirmedIds).toEqual(["relation-1", "relation-defaults"]);
    expect(plan.dismissedIds).toEqual(["missing-endpoint", "missing-type"]);
    expect(plan.linkInserts).toEqual([
      {
        from_id: "entity-1",
        to_id: "entity-2",
        relation_type: "LOCATED_AT",
        direction: "UNI",
        weight: 0.72,
      },
      {
        from_id: "entity-1",
        to_id: "entity-3",
        relation_type: "ALLY",
        direction: "BI",
        weight: 0.5,
      },
    ]);
  });

  it("dismisses relation rows with malformed metadata without creating links", () => {
    const plan = buildRelationBatchConfirmationPlan(
      [
        { id: "null-meta", aliases: null },
        { id: "array-meta", aliases: ["리엔", "카이"] },
        {
          id: "empty-endpoint",
          aliases: {
            from_name: "",
            to_name: "카이",
            relation_type: "ALLY",
          },
        },
      ],
      [{ id: "entity-1", name: "카이" }]
    );

    expect(plan.linkInserts).toEqual([]);
    expect(plan.confirmedIds).toEqual([]);
    expect(plan.dismissedIds).toEqual(["null-meta", "array-meta", "empty-endpoint"]);
  });

  it("splits batch confirmation so entity suggestions are handled before relations", () => {
    const suggestions = [
      { id: "relation-1", type: "RELATION" },
      { id: "entity-1", type: "CHARACTER" },
      { id: "entity-2", type: "PLACE" },
      { id: "relation-2", type: "RELATION" },
    ];

    const result = splitSuggestionsForBatchConfirmation(suggestions);

    expect(result.entitySuggestions.map((suggestion) => suggestion.id)).toEqual([
      "entity-1",
      "entity-2",
    ]);
    expect(result.relationSuggestions.map((suggestion) => suggestion.id)).toEqual([
      "relation-1",
      "relation-2",
    ]);
  });

  it("requires a target entity before confirming a MERGE suggestion", () => {
    expect(
      getMergeTargetValidationError({
        suggested_action: "MERGE",
        matched_entity_id: null,
      })
    ).toBe("별칭/호칭으로 저장할 기존 항목을 먼저 선택하세요.");
    expect(
      getMergeTargetValidationError({
        suggested_action: "MERGE",
        matched_entity_id: "entity-1",
      })
    ).toBeNull();
    expect(getMergeTargetValidationError({ suggested_action: "CREATE" })).toBeNull();
  });

  it("appends excluded terms without normalized duplicates", () => {
    const existing = ["검은 서고"];

    expect(appendExcludedTerm(existing, " 검은서고 ")).toBe(existing);
    expect(appendExcludedTerm(existing, "푸른 문")).toEqual(["검은 서고", "푸른 문"]);
    expect(appendExcludedTerm(null, "푸른 문")).toEqual(["푸른 문"]);
  });
});
