import { beforeEach, describe, expect, it, vi } from "vitest";

const createClientMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());
const analysisGetLatestForChapterMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("next/server", () => ({
  after: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  embedText: vi.fn(),
  AIAnalysisService: vi.fn(),
  AnalysisJobService: vi.fn(function () {
    return {
      getLatestForChapter: analysisGetLatestForChapterMock,
    };
  }),
  ConsistencyService: vi.fn(),
  IndexingService: vi.fn(),
}));

vi.mock("@/lib/services/entity-extraction.service", () => ({
  EntityExtractionService: vi.fn(),
}));

type QueryOperation = {
  table: string;
  type?: "select" | "update" | "insert" | "delete" | "upsert";
  payload?: unknown;
  eq: { column: string; value: unknown }[];
  in: { column: string; values: unknown[] }[];
};

function createActionClient({
  userId = "user-a",
  projects = [],
  entities = [],
  entityLinks = [],
  foreshadows = [],
  suggestions = [],
}: {
  userId?: string | null;
  projects?: { id: string; user_id: string; excluded_terms?: unknown }[];
  entities?: { id: string; project_id: string; [key: string]: unknown }[];
  entityLinks?: { id: string; from_id: string; to_id?: string; [key: string]: unknown }[];
  foreshadows?: { id: string; project_id: string; [key: string]: unknown }[];
  suggestions?: { id: string; project_id: string; [key: string]: unknown }[];
}) {
  const operations: QueryOperation[] = [];

  const rowsForTable = (operation: QueryOperation) => {
    const id = operation.eq.find((call) => call.column === "id")?.value;
    const projectId = operation.eq.find((call) => call.column === "project_id")?.value;
    const userFilter = operation.eq.find((call) => call.column === "user_id")?.value;
    const idIn = operation.in.find((call) => call.column === "id")?.values;

    if (operation.table === "projects") {
      return projects.filter(
        (row) =>
          (!id || row.id === id) &&
          (!userFilter || row.user_id === userFilter)
      );
    }
    if (operation.table === "entities") {
      return entities.filter(
        (row) =>
          (!id || row.id === id) &&
          (!idIn || idIn.includes(row.id)) &&
          (!projectId || row.project_id === projectId)
      );
    }
    if (operation.table === "entity_links") {
      return entityLinks.filter((row) => !id || row.id === id);
    }
    if (operation.table === "foreshadows") {
      return foreshadows.filter(
        (row) => (!id || row.id === id) && (!projectId || row.project_id === projectId)
      );
    }
    if (operation.table === "entity_suggestions") {
      return suggestions.filter(
        (row) => (!id || row.id === id) && (!projectId || row.project_id === projectId)
      );
    }
    return [];
  };

  const findRow = (operation: QueryOperation) => {
    return rowsForTable(operation)[0];
  };

  const resultForOperation = (operation: QueryOperation) => {
    if (operation.type === "select") {
      return { data: rowsForTable(operation), error: null };
    }
    return { data: null, error: null };
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
      })),
    },
    from: vi.fn((table: string) => {
      const operation: QueryOperation = { table, eq: [], in: [] };
      operations.push(operation);

      const builder = {
        select() {
          operation.type = "select";
          return builder;
        },
        update(payload: unknown) {
          operation.type = "update";
          operation.payload = payload;
          return builder;
        },
        insert(payload: unknown) {
          operation.type = "insert";
          operation.payload = payload;
          return builder;
        },
        delete() {
          operation.type = "delete";
          return builder;
        },
        upsert(payload: unknown) {
          operation.type = "upsert";
          operation.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          operation.eq.push({ column, value });
          return builder;
        },
        in(column: string, values: unknown[]) {
          operation.in.push({ column, values });
          return builder;
        },
        order() {
          return builder;
        },
        neq() {
          return builder;
        },
        gte() {
          return builder;
        },
        not() {
          return builder;
        },
        or() {
          return builder;
        },
        async maybeSingle() {
          return { data: findRow(operation) ?? null, error: null };
        },
        async single() {
          return { data: findRow(operation) ?? null, error: null };
        },
        then(
          resolve: (value: { data: unknown; error: null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          return Promise.resolve(resultForOperation(operation)).then(resolve, reject);
        },
      };

      return builder;
    }),
  };

  return { client, operations };
}

describe("project server action ownership boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  const projectId = "00000000-0000-4000-8000-000000000001";
  const otherProjectId = "00000000-0000-4000-8000-000000000002";
  const entityId = "00000000-0000-4000-8000-000000000003";
  const otherEntityId = "00000000-0000-4000-8000-000000000004";
  const linkId = "00000000-0000-4000-8000-000000000005";
  const suggestionId = "00000000-0000-4000-8000-000000000006";
  const foreshadowId = "00000000-0000-4000-8000-000000000007";

  function projectFormData(fields: Record<string, string>) {
    const formData = new FormData();
    Object.entries(fields).forEach(([key, value]) => formData.set(key, value));
    return formData;
  }

  it("does not update an entity when the entity belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      entities: [{ id: entityId, project_id: otherProjectId }],
    });
    createClientMock.mockResolvedValue(client);

    const { updateEntityInline } = await import(
      "@/app/(dashboard)/projects/[id]/codex-actions"
    );
    const result = await updateEntityInline(entityId, projectId, {
      summary: "cross-project edit",
    });

    expect(result).toEqual({ error: "작품 기억 항목을 찾을 수 없습니다" });
    expect(
      operations.filter(
        (operation) => operation.table === "entities" && operation.type === "update"
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not delete an entity when the entity belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      entities: [{ id: entityId, project_id: otherProjectId, name: "리엔" }],
    });
    createClientMock.mockResolvedValue(client);

    const { deleteEntity } = await import(
      "@/app/(dashboard)/projects/[id]/codex-actions"
    );
    const result = await deleteEntity(entityId, projectId, { blockTerm: true });

    expect(result).toEqual({ error: "작품 기억 항목을 찾을 수 없습니다" });
    expect(
      operations.filter((operation) =>
        ["entity_links", "mentions", "entities", "projects"].includes(operation.table) &&
        ["update", "insert", "delete", "upsert"].includes(operation.type ?? "")
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not create an entity link when either endpoint belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      entities: [
        { id: entityId, project_id: projectId },
        { id: otherEntityId, project_id: otherProjectId },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const { createEntityLink } = await import(
      "@/app/(dashboard)/projects/[id]/codex-actions"
    );
    const result = await createEntityLink(
      projectFormData({
        projectId,
        fromId: entityId,
        toId: otherEntityId,
        relationType: "ALLY",
        direction: "UNI",
        weight: "0.5",
      })
    );

    expect(result).toEqual({
      error: "권한이 없거나 존재하지 않는 작품 기억 항목입니다",
    });
    expect(
      operations.filter(
        (operation) => operation.table === "entity_links" && operation.type === "insert"
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not update an entity link when the linked entity belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      entities: [{ id: otherEntityId, project_id: otherProjectId }],
      entityLinks: [{ id: linkId, from_id: otherEntityId }],
    });
    createClientMock.mockResolvedValue(client);

    const { updateEntityLink } = await import(
      "@/app/(dashboard)/projects/[id]/codex-actions"
    );
    const result = await updateEntityLink(linkId, projectId, "ENEMY");

    expect(result).toEqual({ error: "권한이 없습니다" });
    expect(
      operations.filter(
        (operation) => operation.table === "entity_links" && operation.type === "update"
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not delete an entity link when the linked entity belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      entities: [{ id: otherEntityId, project_id: otherProjectId }],
      entityLinks: [{ id: linkId, from_id: otherEntityId }],
    });
    createClientMock.mockResolvedValue(client);

    const { deleteEntityLink } = await import(
      "@/app/(dashboard)/projects/[id]/codex-actions"
    );
    const result = await deleteEntityLink(linkId, projectId, entityId);

    expect(result).toEqual({ error: "권한이 없습니다" });
    expect(
      operations.filter(
        (operation) => operation.table === "entity_links" && operation.type === "delete"
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not confirm a suggestion when the suggestion belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      suggestions: [
        {
          id: suggestionId,
          project_id: otherProjectId,
          type: "CHARACTER",
          status: "PENDING",
          name: "리엔",
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const { confirmSuggestion } = await import(
      "@/app/(dashboard)/projects/[id]/suggestion-actions"
    );
    const result = await confirmSuggestion(suggestionId, projectId);

    expect(result).toEqual({ error: "제안을 찾을 수 없습니다" });
    expect(
      operations.filter(
        (operation) =>
          operation.table === "entity_suggestions" &&
          ["update", "insert", "delete", "upsert"].includes(operation.type ?? "")
      )
    ).toEqual([]);
    expect(
      operations.filter(
        (operation) =>
          operation.table === "entities" &&
          ["update", "insert", "delete", "upsert"].includes(operation.type ?? "")
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not confirm a suggestion as alias when the suggestion belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      suggestions: [
        {
          id: suggestionId,
          project_id: otherProjectId,
          type: "CHARACTER",
          status: "PENDING",
          name: "리엔",
          aliases: [],
        },
      ],
      entities: [{ id: entityId, project_id: projectId, name: "리엔" }],
    });
    createClientMock.mockResolvedValue(client);

    const { confirmSuggestionAsAlias } = await import(
      "@/app/(dashboard)/projects/[id]/suggestion-actions"
    );
    const result = await confirmSuggestionAsAlias(suggestionId, projectId, entityId);

    expect(result).toEqual({ error: "권한이 없거나 존재하지 않는 항목입니다" });
    expect(
      operations.filter((operation) =>
        ["entity_suggestions", "entities"].includes(operation.table) &&
        ["update", "insert", "delete", "upsert"].includes(operation.type ?? "")
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not dismiss and exclude a suggestion when the suggestion belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a", excluded_terms: [] }],
      suggestions: [
        {
          id: suggestionId,
          project_id: otherProjectId,
          type: "CHARACTER",
          status: "PENDING",
          name: "리엔",
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const { dismissSuggestionAndExclude } = await import(
      "@/app/(dashboard)/projects/[id]/suggestion-actions"
    );
    const result = await dismissSuggestionAndExclude(suggestionId, projectId);

    expect(result).toEqual({ error: "제안을 찾을 수 없습니다" });
    expect(
      operations.filter((operation) =>
        ["entity_suggestions", "projects"].includes(operation.table) &&
        ["update", "insert", "delete", "upsert"].includes(operation.type ?? "")
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not dismiss a suggestion that has already been processed", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a", excluded_terms: [] }],
      suggestions: [
        {
          id: suggestionId,
          project_id: projectId,
          type: "CHARACTER",
          status: "CONFIRMED",
          name: "리엔",
        },
      ],
    });
    createClientMock.mockResolvedValue(client);

    const { dismissSuggestion } = await import(
      "@/app/(dashboard)/projects/[id]/suggestion-actions"
    );
    const result = await dismissSuggestion(suggestionId, projectId);

    expect(result).toEqual({ error: "이미 처리된 확인 후보입니다" });
    expect(
      operations.filter((operation) =>
        operation.table === "entity_suggestions" &&
        ["update", "insert", "delete", "upsert"].includes(operation.type ?? "")
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not update a foreshadow when it belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      foreshadows: [{ id: foreshadowId, project_id: otherProjectId }],
    });
    createClientMock.mockResolvedValue(client);

    const { updateForeshadow } = await import(
      "@/app/(dashboard)/projects/[id]/foreshadows/actions"
    );
    const result = await updateForeshadow(
      projectFormData({
        foreshadowId,
        projectId,
        description: "왕관은 아직 봉인되어 있다.",
        planted_chapter: "1",
        expected_reveal: "7",
        status: "PLANTED",
      })
    );

    expect(result).toEqual({ error: "복선을 찾을 수 없습니다" });
    expect(
      operations.filter(
        (operation) => operation.table === "foreshadows" && operation.type === "update"
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not delete a foreshadow when it belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      foreshadows: [{ id: foreshadowId, project_id: otherProjectId }],
    });
    createClientMock.mockResolvedValue(client);

    const { deleteForeshadow } = await import(
      "@/app/(dashboard)/projects/[id]/foreshadows/actions"
    );
    const result = await deleteForeshadow(foreshadowId, projectId);

    expect(result).toEqual({ error: "복선을 찾을 수 없습니다" });
    expect(
      operations.filter(
        (operation) => operation.table === "foreshadows" && operation.type === "delete"
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("does not update a foreshadow status when it belongs to another project", async () => {
    const { client, operations } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
      foreshadows: [{ id: foreshadowId, project_id: otherProjectId }],
    });
    createClientMock.mockResolvedValue(client);

    const { updateForeshadowStatus } = await import(
      "@/app/(dashboard)/projects/[id]/foreshadows/actions"
    );
    const result = await updateForeshadowStatus(foreshadowId, projectId, "REVEALED");

    expect(result).toEqual({ error: "복선을 찾을 수 없습니다" });
    expect(
      operations.filter(
        (operation) => operation.table === "foreshadows" && operation.type === "update"
      )
    ).toEqual([]);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("ignores the latest analysis job when the job belongs to another project", async () => {
    const { client } = createActionClient({
      projects: [{ id: projectId, user_id: "user-a" }],
    });
    createClientMock.mockResolvedValue(client);
    analysisGetLatestForChapterMock.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000008",
      project_id: otherProjectId,
      status: "DONE",
      error: null,
      entity_count: 3,
      relation_count: 2,
      suggestion_count: 1,
      started_at: null,
      finished_at: null,
      created_at: "2026-05-21T00:00:00.000Z",
      updated_at: "2026-05-21T00:00:00.000Z",
    });

    const { getLatestAnalysisJob } = await import(
      "@/app/(dashboard)/projects/[id]/analysis-actions"
    );
    const result = await getLatestAnalysisJob(
      projectId,
      "00000000-0000-4000-8000-000000000009"
    );

    expect(result).toEqual({ error: null, job: null });
    expect(analysisGetLatestForChapterMock).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000009"
    );
  });
});
