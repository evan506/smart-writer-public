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
}: {
  insertedEntity?: { id: string };
  insertError?: { message: string } | null;
  updateError?: { message: string } | null;
  deleteErrors?: Partial<Record<"entity_links" | "mentions" | "entities", { message: string }>>;
  project?: { excluded_terms: unknown } | null;
} = {}) {
  const operations: QueryOperation[] = [];

  const client = {
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

  return { client, operations };
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
}: {
  sourceEntity?: Record<string, unknown> | null;
  targetEntity?: Record<string, unknown> | null;
  sourceFacts?: Record<string, unknown>[];
  targetFacts?: Record<string, unknown>[];
  foreshadows?: Record<string, unknown>[];
} = {}) {
  const operations: QueryOperation[] = [];
  const entitySingles = [sourceEntity, targetEntity];

  const client = {
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

  return { client, operations };
}

describe("codex entity mutation service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("deletes entity dependents and optionally adds the name to excluded terms", async () => {
    const { client, operations } = createMutationClient();

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
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_links",
        type: "delete",
        or: "from_id.eq.entity-1,to_id.eq.entity-1",
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "mentions",
        type: "delete",
        eq: [{ column: "entity_id", value: "entity-1" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "delete",
        eq: [{ column: "id", value: "entity-1" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "projects",
        type: "update",
        payload: { excluded_terms: ["기존", "리엔"] },
        eq: [{ column: "id", value: "project-1" }],
      })
    );
  });

  it("stops delete cascade on relation delete failure", async () => {
    const { client, operations } = createMutationClient({
      deleteErrors: {
        entity_links: { message: "link failed" },
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
    ).resolves.toEqual({ error: "관계 삭제 실패: link failed" });
    expect(operations.map((operation) => operation.table)).toEqual(["entity_links"]);
  });

  it("merges an approved entity into a target alias and moves dependents", async () => {
    const { client, operations } = createMergeClient();
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
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "update",
        payload: { aliases: ["엘프 군주", "엘프왕", "왕"] },
        eq: [{ column: "id", value: "target-entity" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_suggestions",
        type: "update",
        payload: { matched_entity_id: "target-entity" },
        eq: [
          { column: "project_id", value: "project-1" },
          { column: "matched_entity_id", value: "source-entity" },
        ],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "mentions",
        type: "update",
        payload: { entity_id: "target-entity" },
        eq: [{ column: "entity_id", value: "source-entity" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "canon_fact_sources",
        type: "update",
        payload: { fact_id: "target-fact-duplicate" },
        eq: [{ column: "fact_id", value: "source-fact-duplicate" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "canon_facts",
        type: "update",
        payload: { entity_id: "target-entity" },
        eq: [{ column: "id", value: "source-fact-new" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "foreshadows",
        type: "update",
        payload: { entity_ids: ["target-entity", "other-entity"] },
        eq: [{ column: "id", value: "foreshadow-1" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "delete",
        eq: [{ column: "id", value: "source-entity" }],
      })
    );
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("rejects merging an entity into itself", async () => {
    const { client, operations } = createMergeClient();

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
  });
});
