import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ExtractionMemoryPanel,
  type ExtractionMemoryView,
  type MemoryPanelRuleView,
} from "@/components/extraction-memory-panel";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/(dashboard)/projects/[id]/extraction-memory-actions", () => ({
  activateExtractionRule: vi.fn(),
  deleteExtractionRule: vi.fn(),
  disableExtractionRule: vi.fn(),
  generateExtractionProposals: vi.fn(),
  overrideGenreConventionRule: vi.fn(),
  removeProjectExcludedTerm: vi.fn(),
  restoreGenreConventionRule: vi.fn(),
}));

const projectId = "11111111-1111-4111-8111-111111111111";

function rule(p: Partial<MemoryPanelRuleView> & { key: string }): MemoryPanelRuleView {
  return {
    id: p.id ?? `id-${p.key}`,
    key: p.key,
    text: p.text ?? `text-${p.key}`,
    kind: p.kind ?? "EXCLUDE_PATTERN",
    layer: p.layer ?? "project",
    source: p.source ?? "DISTILLED",
    status: p.status ?? "ACTIVE",
  };
}

function render(initial: ExtractionMemoryView, acceptanceRate: number | null = 80) {
  return renderToStaticMarkup(
    <ExtractionMemoryPanel
      projectId={projectId}
      initial={initial}
      metrics={{ confirmed: 8, dismissed: 2, acceptanceRate }}
    />
  );
}

const EMPTY: ExtractionMemoryView = {
  projectRules: [],
  genreRules: [],
  proposals: [],
  excludedNames: [],
};

describe("ExtractionMemoryPanel", () => {
  it("renders the empty state when there is no memory", () => {
    const html = render(EMPTY);
    expect(html).toContain("아직 학습된 규칙이 없습니다");
  });

  it("shows proposals as not-yet-applied", () => {
    const html = render({
      ...EMPTY,
      proposals: [rule({ key: "flashback", text: "회상 중복 제외", status: "DISABLED" })],
    });
    expect(html).toContain("켜기 전에는 추출에 적용되지 않습니다");
    expect(html).toContain("회상 중복 제외");
    expect(html).toContain("적용");
  });

  it("labels genre baseline rules and offers a per-project off switch", () => {
    const html = render({
      ...EMPTY,
      genreRules: [rule({ key: "uns", text: "불특정 인물 제외", layer: "genre", source: "CURATED" })],
    });
    expect(html).toContain("장르 기본");
    expect(html).toContain("이 작품에서 끄기");
  });

  it("shows an overridden genre rule as off with a restore action", () => {
    const html = render({
      ...EMPTY,
      genreRules: [
        rule({ key: "uns", text: "불특정 인물 제외", layer: "genre", status: "DISABLED" }),
      ],
    });
    expect(html).toContain("이 작품에서 꺼짐");
    expect(html).toContain("다시 켜기");
  });

  it("surfaces excluded names with an unexclude affordance", () => {
    const html = render({ ...EMPTY, excludedNames: ["무명 병사"] });
    expect(html).toContain("무명 병사");
    expect(html).toContain("제외 해제");
  });

  it("renders the acceptance-rate metric when present", () => {
    const html = render({ ...EMPTY, projectRules: [rule({ key: "a" })] }, 89);
    expect(html).toContain("후보 승인율 89%");
  });
});
