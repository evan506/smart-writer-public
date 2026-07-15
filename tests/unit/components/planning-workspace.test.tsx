import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlanningWorkspace } from "@/components/planning/planning-workspace";
import type { Chapter, PlanningBlock } from "@/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

vi.mock("@/app/(dashboard)/projects/[id]/planning-actions", () => ({
  createPlanningChildBlock: vi.fn(),
  deletePlanningBlock: vi.fn(),
  linkPlanningBlockToChapter: vi.fn(),
  linkPlanningBlockToEntity: vi.fn(),
  unlinkPlanningBlockFromChapter: vi.fn(),
  unlinkPlanningBlockFromEntity: vi.fn(),
  updatePlanningBlock: vi.fn(),
}));

const projectId = "11111111-1111-4111-8111-111111111111";

function planningBlock(overrides: Partial<PlanningBlock> = {}): PlanningBlock {
  return {
    id: "block-start",
    project_id: projectId,
    parent_id: null,
    kind: "ROOT",
    title: "시작",
    summary: "카이와 리엔의 만남",
    notes: null,
    status: "PLANNED",
    position: 0,
    structure_key: "START",
    created_at: "2026-06-07T00:00:00.000Z",
    updated_at: "2026-06-07T00:00:00.000Z",
    ...overrides,
  };
}

function render(
  blocks: PlanningBlock[],
  options: {
    chapters?: Array<Pick<Chapter, "id" | "chapter_num" | "title" | "updated_at">>;
    chapterReferences?: Array<{
      id: string;
      planning_block_id: string;
      target_id: string;
    }>;
    availableEntities?: Array<{
      id: string;
      name: string;
      type: string;
      summary: string | null;
    }>;
    entityReferences?: Array<{
      id: string;
      planning_block_id: string;
      target_id: string;
    }>;
    linkedEntities?: Array<{
      id: string;
      name: string;
      type: string;
      summary: string | null;
    }>;
    factsByEntityId?: Record<
      string,
      Array<{
        id: string;
        entityId: string;
        factType: string;
        factKey: string | null;
        value: string;
        status: string;
        confidence: number;
        establishedChapterId: string | null;
        establishedChapterNum: number | null;
        approvedAt: string | null;
        sources: [];
      }>
    >;
  } = {}
) {
  return renderToStaticMarkup(
    <PlanningWorkspace
      projectId={projectId}
      projectTitle="엘프 영웅의 큰 흐름"
      initialBlocks={blocks}
      chapters={options.chapters ?? []}
      chapterReferences={options.chapterReferences ?? []}
      availableEntities={options.availableEntities ?? []}
      entityReferences={options.entityReferences ?? []}
      linkedEntities={options.linkedEntities ?? []}
      factsByEntityId={options.factsByEntityId ?? {}}
    />
  );
}

describe("PlanningWorkspace", () => {
  it("renders planning columns as a mobile-first vertical stack before md grid", () => {
    const html = render([
      planningBlock(),
      planningBlock({
        id: "block-development",
        title: "전개",
        position: 1,
        structure_key: "DEVELOPMENT",
      }),
    ]);

    expect(html).toContain("flex w-full flex-col");
    expect(html).toContain("md:grid");
    expect(html).toContain("md:min-w-[760px]");
    expect(html).toContain("구상은 계획이며 원고나 canon으로 자동 반영되지 않습니다.");
  });

  it("shows a product-tone empty state when planning blocks are unavailable", () => {
    const html = render([]);

    expect(html).toContain("구상 블록을 불러오지 못했습니다.");
    expect(html).toContain("프로젝트 목록에서 다시 진입해주세요.");
  });

  it("keeps manuscript chapter references manual and optional", () => {
    const html = render([planningBlock()]);

    expect(html).toContain("원고 참조");
    expect(html).toContain("선택 사항");
    expect(html).toContain("계획과 원고는 수동으로만 연결됩니다.");
  });

  it("hides Codex memory link controls on root planning blocks", () => {
    const html = render([planningBlock()], {
      availableEntities: [
        {
          id: "entity-1",
          name: "카이",
          type: "CHARACTER",
          summary: null,
        },
      ],
    });

    expect(html).toContain("기본 4블록은 큰 구조를 잡는 영역입니다.");
    expect(html).toContain("작품 기억 연결은 하위 구상 카드에서 사용하세요.");
    expect(html).not.toContain('aria-label="연결할 작품 기억"');
    expect(html).not.toContain("작품 기억 선택");
  });

  it("renders the selected root path and its child column without showing unrelated branches", () => {
    const start = planningBlock();
    const episode = planningBlock({
      id: "episode-1",
      parent_id: start.id,
      kind: "EPISODE",
      title: "카이와의 첫 만남",
      summary: "카이와 리엔의 첫 만남에 대한 에피소드",
      status: "EXPANDED",
      position: 0,
      structure_key: null,
    });
    const episodeChapter = planningBlock({
      id: "chapter-1",
      parent_id: episode.id,
      kind: "CHAPTER",
      title: "첫 만남",
      summary: "첫 만남을 다루는 회차",
      position: 0,
      structure_key: null,
    });
    const development = planningBlock({
      id: "block-development",
      title: "전개",
      position: 1,
      structure_key: "DEVELOPMENT",
    });
    const hiddenScene = planningBlock({
      id: "hidden-scene",
      parent_id: development.id,
      kind: "SCENE",
      title: "보이지 않아야 하는 장면",
      position: 0,
      structure_key: null,
    });

    const html = render([start, development, episode, episodeChapter, hiddenScene]);

    expect(html).toContain("현재 선택:");
    expect(html).toContain("시작의 구체화 카드");
    expect(html).toContain("카이와의 첫 만남");
    expect(html).not.toContain("보이지 않아야 하는 장면");
  });

  it("shows selected child cards with inspector detail and a selected marker", () => {
    const start = planningBlock();
    const episode = planningBlock({
      id: "episode-1",
      parent_id: start.id,
      kind: "EPISODE",
      title: "카이와의 첫 만남",
      summary: "카이와 리엔의 첫 만남에 대한 에피소드",
      position: 0,
      structure_key: null,
    });

    const html = render([episode, start]);

    expect(html).toContain("선택한 구상 카드");
    expect(html).toContain("시작 / 카이와의 첫 만남");
    expect(html).toContain("선택됨");
    expect(html).toContain("카이와의 첫 만남 아래에 추가");
  });

  it("renders existing manuscript chapter references only for chapter planning cards", () => {
    const start = planningBlock();
    const episode = planningBlock({
      id: "episode-1",
      parent_id: start.id,
      kind: "EPISODE",
      title: "카이와의 첫 만남",
      position: 0,
      structure_key: null,
    });
    const chapterCard = planningBlock({
      id: "chapter-card-1",
      parent_id: episode.id,
      kind: "CHAPTER",
      title: "첫 만남",
      position: 0,
      structure_key: null,
    });
    const chapter = {
      id: "manuscript-chapter-1",
      chapter_num: 1,
      title: "카이와 리엔",
      updated_at: "2026-06-07T00:00:00.000Z",
    };

    const html = render([chapterCard, start, episode], {
      chapters: [chapter],
      chapterReferences: [
        {
          id: "planning-link-1",
          planning_block_id: chapterCard.id,
          target_id: chapter.id,
        },
      ],
    });

    expect(html).toContain("참조 중");
    expect(html).toContain("기존 회차 참조");
    expect(html).toContain("1화 · 카이와 리엔");
    expect(html).toContain("원고와 canon은 자동 변경되지 않습니다.");
    expect(html).toContain(
      'href="/projects/11111111-1111-4111-8111-111111111111/write?chapter=manuscript-chapter-1"'
    );
  });

  it("uses custom planning dropdown controls instead of native select markup", () => {
    const html = render([planningBlock()]);

    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain('aria-label="구상 카드 상태"');
    expect(html).toContain('aria-label="추가할 구체화 카드 종류"');
    expect(html).toContain("계획만 있음");
    expect(html).toContain("에피소드");
    expect(html).not.toContain("<select");
  });

  it("renders linked Codex memory and approved facts as read-only context", () => {
    const start = planningBlock();
    const characterCard = planningBlock({
      id: "character-card-1",
      parent_id: start.id,
      kind: "CHARACTER_PLAN",
      title: "카이 인물 계획",
      position: 0,
      structure_key: null,
    });
    const entity = {
      id: "entity-1",
      name: "카이",
      type: "CHARACTER",
      summary: "약해진 상태로 등장하는 핵심 인물",
    };

    const html = render([characterCard, start], {
      availableEntities: [entity],
      linkedEntities: [entity],
      entityReferences: [
        {
          id: "entity-link-1",
          planning_block_id: characterCard.id,
          target_id: entity.id,
        },
      ],
      factsByEntityId: {
        [entity.id]: [
          {
            id: "fact-1",
            entityId: entity.id,
            factType: "STATE",
            factKey: "약화",
            value: "카이는 초반부에 힘을 완전히 쓰지 못한다.",
            status: "APPROVED",
            confidence: 0.9,
            establishedChapterId: null,
            establishedChapterNum: null,
            approvedAt: null,
            sources: [],
          },
        ],
      },
    });

    expect(html).toContain("연결된 작품 기억");
    expect(html).toContain("작품 기억 연결");
    expect(html).toContain("카이");
    expect(html).toContain("승인된 설정");
    expect(html).toContain("상태 · 약화");
    expect(html).toContain("카이는 초반부에 힘을 완전히 쓰지 못한다.");
    expect(html).toContain("구상, 원고, canon은 자동 변경되지 않습니다.");
  });

  it("shows an explicit empty state when linked Codex memory has no approved facts", () => {
    const start = planningBlock();
    const characterCard = planningBlock({
      id: "character-card-1",
      parent_id: start.id,
      kind: "CHARACTER_PLAN",
      title: "카이 인물 계획",
      position: 0,
      structure_key: null,
    });
    const entity = {
      id: "entity-1",
      name: "카이",
      type: "CHARACTER",
      summary: null,
    };

    const html = render([characterCard, start], {
      availableEntities: [entity],
      linkedEntities: [entity],
      entityReferences: [
        {
          id: "entity-link-1",
          planning_block_id: characterCard.id,
          target_id: entity.id,
        },
      ],
      factsByEntityId: {
        [entity.id]: [],
      },
    });

    expect(html).toContain("연결된 작품 기억");
    expect(html).toContain("카이");
    expect(html).toContain("아직 이 작품 기억에 연결된 승인 설정이 없습니다.");
    expect(html).toContain("구상, 원고, canon은 자동 변경되지 않습니다.");
  });
});
