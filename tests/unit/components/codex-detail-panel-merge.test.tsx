import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CodexDetailPanel } from "@/components/codex-detail-panel";
import type { CodexDetailPanelProps } from "@/components/codex-detail-panel/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(dashboard)/projects/[id]/codex-actions", () => ({
  deleteEntity: vi.fn(),
  mergeEntityAsAlias: vi.fn(),
  removeEntityAlias: vi.fn(),
  updateEntity: vi.fn(),
}));

function renderPanel(overrides: Partial<CodexDetailPanelProps> = {}) {
  const props: CodexDetailPanelProps = {
    entity: {
      id: "source-entity",
      name: "엘프왕",
      type: "CHARACTER",
      summary: "엘프들의 지도자",
      aliases: [],
    },
    kind: "entity",
    entityLinks: [],
    relationEvidence: {},
    allEntities: [
      {
        id: "source-entity",
        name: "엘프왕",
        type: "CHARACTER",
        summary: "엘프들의 지도자",
        aliases: [],
      },
      {
        id: "target-entity",
        name: "엘프들의 왕",
        type: "CHARACTER",
        summary: "엘프들의 왕으로 불리는 인물",
        aliases: ["왕"],
      },
    ],
    chapters: [],
    evidence: [],
    foreshadows: [],
    facts: [],
    status: "confirmed",
    firstChapter: 2,
    projectId: "project-1",
    onClose: vi.fn(),
    onEntityClick: vi.fn(),
    onDeleted: vi.fn(),
    ...overrides,
  };

  return renderToStaticMarkup(<CodexDetailPanel {...props} />);
}

describe("CodexDetailPanel merge-as-alias affordance", () => {
  it("shows the action to merge an approved entity as another entity alias", () => {
    const html = renderPanel();

    expect(html).toContain("다른 항목의 별칭으로 합치기");
    expect(html).toContain("작품 기억에서 삭제");
    expect(html).toContain("관리 작업");
    expect(html).not.toContain("source-e");
  });

  // Regression: the codex list mixes saved entities with pending candidates, and a
  // candidate's `id` is an entity_suggestions row. Every management action resolves the
  // id against `entities`, so offering them on a candidate produced a guaranteed failure
  // — merge surfaced the raw PostgREST error "Cannot coerce the result to a single JSON
  // object" to the author. Candidates are approved in the write workspace's 확인 panel.
  it("withholds every entity management action from a pending candidate", () => {
    const html = renderPanel({
      kind: "suggestion",
      status: "review",
      entity: {
        id: "suggestion-row",
        name: "리엔",
        type: "CHARACTER",
        summary: "리엔 하르트의 약칭",
        aliases: ["리엔 공"],
      },
    });

    expect(html).not.toContain("관리 작업");
    expect(html).not.toContain("다른 항목의 별칭으로 합치기");
    expect(html).not.toContain("작품 기억에서 삭제");
    expect(html).not.toContain("별칭/호칭 제거");
    expect(html).not.toContain("편집");

    // …and points the author at the surface that can actually act on it.
    expect(html).toContain("아직 후보입니다");
    expect(html).toContain("확인 패널에서 검토하기");
    expect(html).toContain("/projects/project-1/write");
  });

  it("still renders the candidate's record so the author can judge it", () => {
    const html = renderPanel({
      kind: "suggestion",
      status: "review",
      entity: {
        id: "suggestion-row",
        name: "리엔",
        type: "CHARACTER",
        summary: "리엔 하르트의 약칭",
        aliases: ["리엔 공"],
      },
    });

    expect(html).toContain("리엔");
    expect(html).toContain("리엔 하르트의 약칭");
    expect(html).toContain("리엔 공");
  });
});
