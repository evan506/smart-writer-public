import { beforeEach, describe, expect, it, vi } from "vitest";

const listApprovedCodexFactsByEntityMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/canon-facts/read.service", () => ({
  listApprovedCodexFactsByEntity: listApprovedCodexFactsByEntityMock,
}));

function query(
  data: unknown,
  error: { message: string } | null = null
) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (
      resolve: (value: {
        data: unknown;
        error: { message: string } | null;
      }) => unknown
    ) => Promise.resolve(resolve({ data, error })),
  };
  return builder;
}

describe("planning read service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns entity links and approved facts for linked Codex memory", async () => {
    listApprovedCodexFactsByEntityMock.mockResolvedValue({
      "entity-1": [
        {
          id: "fact-1",
          entityId: "entity-1",
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
    });
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(
          query([
            {
              id: "entity-1",
              name: "카이",
              type: "CHARACTER",
              summary: "약해진 상태",
              project_id: "project-1",
            },
            {
              id: "entity-2",
              name: "리엔",
              type: "CHARACTER",
              summary: null,
              project_id: "project-1",
            },
          ])
        )
        .mockReturnValueOnce(
          query([
            {
              id: "link-1",
              planning_block_id: "block-1",
              target_id: "entity-1",
            },
            {
              id: "stale-link",
              planning_block_id: "block-1",
              target_id: "missing-entity",
            },
          ])
        ),
    };

    const { getPlanningMemoryContext } = await import(
      "@/lib/services/planning/read.service"
    );

    const result = await getPlanningMemoryContext(supabase as never, "project-1");

    expect(result.availableEntities).toHaveLength(2);
    expect(result.entityLinks).toEqual([
      {
        id: "link-1",
        planning_block_id: "block-1",
        target_id: "entity-1",
      },
    ]);
    expect(result.linkedEntities).toEqual([
      {
        id: "entity-1",
        name: "카이",
        type: "CHARACTER",
        summary: "약해진 상태",
      },
    ]);
    expect(listApprovedCodexFactsByEntityMock).toHaveBeenCalledWith(
      supabase,
      "project-1",
      ["entity-1"]
    );
    expect(result.factsByEntityId["entity-1"]?.[0]?.value).toContain("힘을");
  });

  it("does not request approved facts for missing or deleted entity targets", async () => {
    listApprovedCodexFactsByEntityMock.mockResolvedValue({});
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(
          query([
            {
              id: "entity-1",
              name: "카이",
              type: "CHARACTER",
              summary: null,
              project_id: "project-1",
            },
          ])
        )
        .mockReturnValueOnce(
          query([
            {
              id: "stale-link",
              planning_block_id: "block-1",
              target_id: "deleted-entity",
            },
          ])
        ),
    };

    const { getPlanningMemoryContext } = await import(
      "@/lib/services/planning/read.service"
    );

    const result = await getPlanningMemoryContext(supabase as never, "project-1");

    expect(result.entityLinks).toEqual([]);
    expect(result.linkedEntities).toEqual([]);
    expect(listApprovedCodexFactsByEntityMock).toHaveBeenCalledWith(
      supabase,
      "project-1",
      []
    );
    expect(result.factsByEntityId).toEqual({});
  });

  it("throws when available Codex memory cannot be loaded", async () => {
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(
          query(null, {
            message: "permission denied for table entities",
          })
        )
        .mockReturnValueOnce(query([])),
    };

    const { getPlanningMemoryContext } = await import(
      "@/lib/services/planning/read.service"
    );

    await expect(
      getPlanningMemoryContext(supabase as never, "project-1")
    ).rejects.toThrow(
      "작품 기억 정보를 불러오지 못했습니다: permission denied for table entities"
    );
    expect(listApprovedCodexFactsByEntityMock).not.toHaveBeenCalled();
  });

  it("throws when planning memory links cannot be loaded", async () => {
    const supabase = {
      from: vi
        .fn()
        .mockReturnValueOnce(query([]))
        .mockReturnValueOnce(
          query(null, {
            message: "Could not find the table 'public.planning_links'",
          })
        ),
    };

    const { getPlanningMemoryContext } = await import(
      "@/lib/services/planning/read.service"
    );

    await expect(
      getPlanningMemoryContext(supabase as never, "project-1")
    ).rejects.toThrow("구상 연결 정보를 불러오지 못했습니다");
    expect(listApprovedCodexFactsByEntityMock).not.toHaveBeenCalled();
  });
});
