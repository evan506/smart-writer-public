import { describe, expect, it } from "vitest";
import {
  aiConflictsToWarnings,
  dbConflictsToWarnings,
  mergeWarnings,
} from "@/lib/utils/match-warnings";
import type { InlineWarning } from "@/types";

describe("match-warnings", () => {
  it("converts DB conflicts to inline warnings using matched entity text", () => {
    const warnings = dbConflictsToWarnings(
      [
        {
          entity_id: "entity-1",
          entity_name: "검은 서고",
          conflict_type: "설정 충돌",
          detail: "이전 장에서는 봉인된 장소로 설명됨",
        },
      ],
      "리엔은 검은 서고의 문을 열었다."
    );

    expect(warnings).toEqual([
      {
        id: "db-entity-1-4",
        severity: "medium",
        type: "설정 충돌",
        entityName: "검은 서고",
        detail: "이전 장에서는 봉인된 장소로 설명됨",
        matchedText: "검은 서고",
        source: "db",
      },
    ]);
  });

  it("falls back to AI conflict entity when matchedText is absent", () => {
    const warnings = aiConflictsToWarnings(
      [
        {
          type: "시간선 충돌",
          severity: "high",
          entity: "리엔",
          detail: "같은 시각 두 장소에 등장함",
          suggestion: "한 장면의 시각을 조정",
        },
      ],
      "리엔은 왕궁 지하로 향했다."
    );

    expect(warnings).toMatchObject([
      {
        severity: "high",
        type: "시간선 충돌",
        entityName: "리엔",
        detail: "같은 시각 두 장소에 등장함",
        suggestion: "한 장면의 시각을 조정",
        matchedText: "리엔",
        source: "ai",
      },
    ]);
  });

  it("replaces warnings from the same source while preserving the other source", () => {
    const previous: InlineWarning[] = [
      {
        id: "db-old",
        severity: "medium",
        type: "설정 충돌",
        entityName: "리엔",
        detail: "old",
        matchedText: "리엔",
        source: "db" as const,
      },
      {
        id: "ai-old",
        severity: "low",
        type: "문체",
        entityName: "카이",
        detail: "keep",
        matchedText: "카이",
        source: "ai" as const,
      },
    ];
    const next: InlineWarning[] = [
      {
        id: "db-new",
        severity: "medium",
        type: "설정 충돌",
        entityName: "검은 서고",
        detail: "new",
        matchedText: "검은 서고",
        source: "db" as const,
      },
    ];

    expect(mergeWarnings(previous, next, "db").map((warning) => warning.id)).toEqual([
      "ai-old",
      "db-new",
    ]);
  });
});
