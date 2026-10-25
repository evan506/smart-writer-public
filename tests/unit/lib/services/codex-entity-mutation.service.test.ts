import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCodexEntity,
  deleteCodexEntity,
  mergeCodexEntityAsAlias,
  updateCodexEntity,
} from "@/lib/services/codex/entity-mutation.service";

const afterMock = vi.hoisted(() => vi.fn());
const createClientMock = vi.hoisted(() => vi.fn());
const embedTextMock = vi.hoisted(() => vi.fn());
const budgetedOptionsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/services/budgeted-embedding", () => ({
  createBudgetedEmbeddingOptions: budgetedOptionsMock,
}));

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/services/embedding.service", () => ({
  embedText: embedTextMock,
}));

vi.mock("@/lib/services/llm-usage-logger.service", () => ({
  createLLMUsageLogger: vi.fn(() => vi.fn()),
}));

type QueryOperation = {
  table: string;
  type?: "select" | "insert" | "update" | "delete";
  selectColumns?: string;
  payload?: unknown;
  eq: { column: string; value: unknown }[];
  or?: string;
};

function createMutationClient({
  insertedEntity = { id: "entity-new" },
  insertError = null,
  updateError = null,
  deleteErrors = {},
  project = { excluded_terms: ["기존"] },
  rpcResults = {},
}: {
  insertedEntity?: { id: string };
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
  deleteErrors?: Partial<Record<"entity_links" | "mentions" | "entities", { message: string }>>;
  project?: { excluded_terms: unknown } | null;
  rpcResults?: Record<
    string,
    { data: unknown; error: { message: string } | null }
  >;
} = {}) {
  const operations: QueryOperation[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];

  const client = {
    async rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      return rpcResults[name] ?? { data: null, error: null };
    },
    from(table: string) {
      const operation: QueryOperation = { table, eq: [] };
      operations.push(operation);

      const builder = {
        select(columns: string) {
          operation.type ??= "select";
          operation.selectColumns = columns;
          return builder;
        },
        insert(payload: unknown) {
          operation.type = "insert";
          operation.payload = payload;
          return builder;
        },
        update(payload: unknown) {
          operation.type = "update";
          operation.payload = payload;
          return builder;
        },
        delete() {
          operation.type = "delete";
          return builder;
        },
        eq(column: string, value: unknown) {
          operation.eq.push({ column, value });
          return builder;
        },
        or(filters: string) {
          operation.or = filters;
          return builder;
        },
        async single() {
          if (operation.table === "entities" && operation.type === "insert") {
            return { data: insertedEntity, error: insertError };
          }
          if (operation.table === "projects" && operation.type === "select") {
            return { data: project, error: null };
          }
          return { data: null, error: null };
        },
        then(
          resolve: (value: { data: null; error: { message: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          const deleteError =
            operation.type === "delete"
              ? deleteErrors[operation.table as keyof typeof deleteErrors] ?? null
              : null;
          const error = operation.type === "update" ? updateError : deleteError;
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        },
      };

      return builder;
    },
  };

  return { client, operations, rpcCalls };
}

function createMergeClient({
  sourceEntity = {
    id: "source-entity",
    project_id: "project-1",
    name: "엘프왕",
    type: "CHARACTER",
    summary: "잘못 분리된 항목",
    aliases: ["왕"],
  },
  targetEntity = {
    id: "target-entity",
    project_id: "project-1",
    name: "엘프들의 왕",
    type: "CHARACTER",
    summary: "엘프들의 지도자",
    aliases: ["엘프 군주"],
  },
  sourceFacts = [
    {
      id: "source-fact-duplicate",
      fact_type: "ROLE",
      fact_key: "title",
      value: "엘프들의 왕",
      status: "APPROVED",
    },
    {
      id: "source-fact-new",
      fact_type: "ATTRIBUTE",
      fact_key: "species",
      value: "엘프",
      status: "APPROVED",
    },
  ],
  targetFacts = [
    {
      id: "target-fact-duplicate",
      fact_type: "ROLE",
      fact_key: "title",
      value: "엘프들의 왕",
      status: "APPROVED",
    },
  ],
  foreshadows = [
    { id: "foreshadow-1", entity_ids: ["source-entity", "other-entity"] },
  ],
  rpcResult = {
    data: [
      {
        source_name: "엘프왕",
        target_name: "엘프들의 왕",
        target_summary: "엘프들의 지도자",
        target_aliases: ["엘프 군주", "엘프왕", "왕"],
      },
    ],
    error: null,
  },
}: {
  sourceEntity?: Record<string, unknown> | null;
  targetEntity?: Record<string, unknown> | null;
  sourceFacts?: Record<string, unknown>[];
  targetFacts?: Record<string, unknown>[];
  foreshadows?: Record<string, unknown>[];
  rpcResult?: { data: unknown; error: { message: string } | null };
} = {}) {
  const operations: QueryOperation[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];
  const entitySingles = [sourceEntity, targetEntity];

  const client = {
    async rpc(name: string, args: unknown) {
      rpcCalls.push({ name, args });
      return rpcResult;
    },
    from(table: string) {
      const operation: QueryOperation = { table, eq: [] };
      operations.push(operation);

      const builder = {
        select(columns: string) {
          operation.type ??= "select";
          operation.selectColumns = columns;
          return builder;
        },
        update(payload: unknown) {
          operation.type = "update";
          operation.payload = payload;
          return builder;
        },
        delete() {
          operation.type = "delete";
          return builder;
        },
        eq(column: string, value: unknown) {
          operation.eq.push({ column, value });
          return builder;
        },
        async single() {
          if (operation.table === "entities") {
            const data = entitySingles.shift() ?? null;
            return {
              data,
              error: data ? null : { message: "not found" },
            };
          }
          return { data: null, error: null };
        },
        then(
          resolve: (value: { data: unknown; error: { message: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          if (operation.type === "select" && operation.table === "canon_facts") {
            const entityId = operation.eq.find((item) => item.column === "entity_id")?.value;
            return Promise.resolve({
              data: entityId === "source-entity" ? sourceFacts : targetFacts,
              error: null,
            }).then(resolve, reject);
          }
          if (operation.type === "select" && operation.table === "foreshadows") {
            return Promise.resolve({ data: foreshadows, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };

      return builder;
    },
  };

  return { client, operations, rpcCalls };
}

describe("codex entity mutation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    budgetedOptionsMock.mockReset().mockReturnValue({ onComplete: vi.fn() });
    embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it("creates an entity and schedules embedding refresh", async () => {
    const { client, operations } = createMutationClient({
      insertedEntity: { id: "entity-1" },
    });
    const background = createMutationClient();
    createClientMock.mockResolvedValue(background.client);

    const result = await createCodexEntity(
      client as unknown as Parameters<typeof createCodexEntity>[0],
      {
        projectId: "project-1",
        name: "리엔",
        type: "CHARACTER",
        summary: "북부의 기사",
        aliases: ["검은 기사"],
      }
    );

    expect(result).toEqual({ error: null });
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "insert",
        payload: {
          project_id: "project-1",
          name: "리엔",
          type: "CHARACTER",
          summary: "북부의 기사",
          aliases: ["검은 기사"],
        },
      })
    );
    expect(afterMock).toHaveBeenCalledTimes(1);

    await afterMock.mock.calls[0][0]();

    expect(embedTextMock).toHaveBeenCalledWith(
      "리엔 북부의 기사 검은 기사",
      expect.anything()
    );
    expect(background.operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "update",
        payload: { embedding: JSON.stringify([0.1, 0.2, 0.3]) },
        eq: [{ column: "id", value: "entity-1" }],
      })
    );
  });

  it("updates an entity and preserves database error messages", async () => {
    const errorClient = createMutationClient({
      updateError: { message: "update failed" },
    });

    await expect(
      updateCodexEntity(
        errorClient.client as unknown as Parameters<typeof updateCodexEntity>[0],
        "entity-1",
        {
          name: "리엔",
          type: "CHARACTER",
          summary: null,
          aliases: null,
        }
      )
    ).resolves.toEqual({ error: "update failed" });
    expect(afterMock).not.toHaveBeenCalled();

    const { client, operations } = createMutationClient();
    const result = await updateCodexEntity(
      client as unknown as Parameters<typeof updateCodexEntity>[0],
      "entity-2",
      {
        name: "검은 서고",
        type: "PLACE",
        summary: "금서가 보관된 장소",
        aliases: ["흑서고"],
      }
    );

    expect(result).toEqual({ error: null });
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "update",
        payload: {
          name: "검은 서고",
          type: "PLACE",
          summary: "금서가 보관된 장소",
          aliases: ["흑서고"],
        },
        eq: [{ column: "id", value: "entity-2" }],
      })
    );
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("deletes an entity through one atomic RPC", async () => {
    const { client, operations, rpcCalls } = createMutationClient({
      rpcResults: {
        delete_codex_entity: {
          data: [{ entity_name: "리엔", excluded_term_added: true }],
          error: null,
        },
      },
    });

    const result = await deleteCodexEntity(
      client as unknown as Parameters<typeof deleteCodexEntity>[0],
      {
        entityId: "entity-1",
        projectId: "project-1",
        entityName: "리엔",
        blockTerm: true,
      }
    );

    expect(result).toEqual({ error: null });
    expect(rpcCalls).toEqual([
      {
        name: "delete_codex_entity",
        args: {
          p_project_id: "project-1",
          p_entity_id: "entity-1",
          p_block_term: true,
        },
      },
    ]);
    expect(operations).toEqual([]);
  });

  it("returns an atomic delete RPC error without extra mutations", async () => {
    const { client, operations } = createMutationClient({
      rpcResults: {
        delete_codex_entity: {
          data: null,
          error: { message: "delete rolled back" },
        },
      },
    });

    await expect(
      deleteCodexEntity(
        client as unknown as Parameters<typeof deleteCodexEntity>[0],
        {
          entityId: "entity-1",
          projectId: "project-1",
          entityName: "리엔",
        }
      )
    ).resolves.toEqual({ error: "delete rolled back" });
    expect(operations).toEqual([]);
  });

  it("merges entities through one atomic RPC and refreshes the target embedding", async () => {
    const { client, operations, rpcCalls } = createMergeClient();
    const background = createMutationClient();
    createClientMock.mockResolvedValue(background.client);

    const result = await mergeCodexEntityAsAlias(
      client as unknown as Parameters<typeof mergeCodexEntityAsAlias>[0],
      {
        sourceEntityId: "source-entity",
        targetEntityId: "target-entity",
        projectId: "project-1",
      }
    );

    expect(result).toEqual({
      error: null,
      sourceName: "엘프왕",
      targetName: "엘프들의 왕",
    });
    expect(rpcCalls).toEqual([
      {
        name: "merge_codex_entity_as_alias",
        args: {
          p_project_id: "project-1",
          p_source_entity_id: "source-entity",
          p_target_entity_id: "target-entity",
        },
      },
    ]);
    expect(operations).toEqual([]);
    expect(afterMock).toHaveBeenCalledTimes(1);

    await afterMock.mock.calls[0][0]();
    expect(embedTextMock).toHaveBeenCalledWith(
      "엘프들의 왕 엘프들의 지도자 엘프 군주 엘프왕 왕",
      expect.anything()
    );
  });

  it("rejects merging an entity into itself", async () => {
    const { client, operations, rpcCalls } = createMergeClient();

    await expect(
      mergeCodexEntityAsAlias(
        client as unknown as Parameters<typeof mergeCodexEntityAsAlias>[0],
        {
          sourceEntityId: "same-entity",
          targetEntityId: "same-entity",
          projectId: "project-1",
        }
      )
    ).resolves.toEqual({ error: "같은 항목으로는 합칠 수 없습니다" });
    expect(operations).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });
  it("preserves manual confirmation and forwards owner when optional embedding is blocked", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      budgetedOptionsMock.mockImplementation(() => { throw new Error("budget blocked"); });
      const { client } = createMutationClient();
const bg = createMutationClient();
createClientMock.mockResolvedValue(bg.client);
const result = await createCodexEntity(client as never, { projectId: "project-1", userId: "owner-1", name: "리엔", type: "CHARACTER", summary: null, aliases: [] });
      expect(result.error).toBeNull();
      await expect(afterMock.mock.calls[0][0]()).resolves.toBeUndefined();
      expect(budgetedOptionsMock).toHaveBeenCalledTimes(1);
      expect(budgetedOptionsMock).toHaveBeenCalledWith(bg.client, expect.objectContaining({ projectId: "project-1", userId: "owner-1" }));
      expect(embedTextMock).not.toHaveBeenCalled();
      expect(bg.operations).toHaveLength(0);
    } finally { log.mockRestore(); }
  });
});
