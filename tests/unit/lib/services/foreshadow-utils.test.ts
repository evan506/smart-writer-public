import { describe, expect, it } from "vitest";
import {
  buildForeshadowListMetrics,
  getForeshadowRevalidationPaths,
  isForeshadowOwnedByProject,
  isForeshadowStatus,
  parseForeshadowFormData,
} from "@/lib/services/foreshadow-utils";

function formData(entries: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      data.append(key, item);
    }
  }
  return data;
}

describe("foreshadow utils", () => {
  it("parses create form data with nullable reveal chapter and deduped entity ids", () => {
    const result = parseForeshadowFormData(
      formData({
        projectId: "project-1",
        description: "  아이들이 리켈을 두려운 호칭으로 부르는 이유  ",
        planted_chapter: "1",
        expected_reveal: "",
        entity_ids: ["entity-1", "entity-1", "entity-2", ""],
      })
    );

    expect(result).toEqual({
      ok: true,
      payload: {
        projectId: "project-1",
        foreshadowId: undefined,
        description: "아이들이 리켈을 두려운 호칭으로 부르는 이유",
        plantedChapter: 1,
        expectedReveal: null,
        status: "PLANTED",
        entityIds: ["entity-1", "entity-2"],
      },
    });
  });

  it("rejects invalid form ids, chapters, and statuses before DB writes", () => {
    expect(parseForeshadowFormData(formData({ planted_chapter: "1" }))).toEqual({
      ok: false,
      error: "프로젝트를 찾을 수 없습니다",
    });
    expect(
      parseForeshadowFormData(
        formData({ projectId: "project-1", planted_chapter: "0" })
      )
    ).toEqual({ ok: false, error: "심은 회차를 올바르게 입력하세요" });
    expect(
      parseForeshadowFormData(
        formData({
          projectId: "project-1",
          foreshadowId: "foreshadow-1",
          planted_chapter: "1",
          expected_reveal: "later",
          status: "REVEALED",
        }),
        { requireForeshadowId: true, requireStatus: true }
      )
    ).toEqual({ ok: false, error: "회수 예정 회차를 올바르게 입력하세요" });
    expect(
      parseForeshadowFormData(
        formData({
          projectId: "project-1",
          foreshadowId: "foreshadow-1",
          planted_chapter: "1",
          status: "DONE",
        }),
        { requireForeshadowId: true, requireStatus: true }
      )
    ).toEqual({ ok: false, error: "복선 상태를 올바르게 선택하세요" });
  });

  it("validates foreshadow status and ownership guards", () => {
    expect(isForeshadowStatus("PLANTED")).toBe(true);
    expect(isForeshadowStatus("DONE")).toBe(false);
    expect(isForeshadowOwnedByProject({ project_id: "project-1" }, "project-1")).toBe(true);
    expect(isForeshadowOwnedByProject({ project_id: "other" }, "project-1")).toBe(false);
    expect(isForeshadowOwnedByProject(null, "project-1")).toBe(false);
  });

  it("builds deterministic list metrics while ignoring unknown statuses", () => {
    const result = buildForeshadowListMetrics([
      { status: "PLANTED", expected_reveal: 5 },
      { status: "PLANTED", expected_reveal: null },
      { status: "REVEALED", expected_reveal: 3 },
      { status: "ABANDONED", expected_reveal: 0 },
      { status: "UNKNOWN", expected_reveal: null },
      { status: null, expected_reveal: 9 },
    ]);

    expect(result).toEqual({
      counts: {
        ALL: 6,
        PLANTED: 2,
        REVEALED: 1,
        ABANDONED: 1,
      },
      unscheduledCount: 3,
    });
  });

  it("returns all paths that mutations should revalidate", () => {
    expect(getForeshadowRevalidationPaths("project-1")).toEqual([
      "/projects/project-1/foreshadows",
      "/projects/project-1",
    ]);
    expect(getForeshadowRevalidationPaths("project-1", "foreshadow-1")).toEqual([
      "/projects/project-1/foreshadows",
      "/projects/project-1/foreshadows/foreshadow-1",
      "/projects/project-1",
    ]);
  });
});
