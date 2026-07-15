import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmEntitySuggestion } from "@/lib/services/suggestions/confirm-entity.service";

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
  type?: "select" | "insert" | "update";
  selectColumns?: string;
  payload?: unknown;
  eq: { column: string; value: unknown }[];
};

function createConfirmClient({
  existingEntity = null,
  insertedEntity = { id: "entity-new" },
  insertError = null,
  statusError = null,
}: {
  existingEntity?: { id: string; summary: string | null; aliases: unknown } | null;
  insertedEntity?: { id: string };
  insertError?: { message: string } | null;
  statusError?: { message: string } | null;
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
        eq(column: string, value: unknown) {
          operation.eq.push({ column, value });
          return builder;
        },
        async maybeSingle() {
          return { data: existingEntity, error: null };
        },
        async single() {
          if (operation.table === "entities" && operation.type === "insert") {
            return { data: insertedEntity, error: insertError };
          }
          return { data: null, error: null };
        },
        then(
          resolve: (value: { data: null; error: { message: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          const error =
            operation.table === "entity_suggestions" && operation.type === "update"
              ? statusError
              : null;
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        },
      };

      return builder;
    },
  };

  return { client, operations };
}

describe("confirmEntitySuggestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it("merges into an existing entity and confirms the suggestion", async () => {
    const { client, operations } = createConfirmClient({
      existingEntity: {
        id: "entity-1",
        summary: "짧은 요약",
        aliases: ["검은기사"],
      },
    });

    const result = await confirmEntitySuggestion(
      client as unknown as Parameters<typeof confirmEntitySuggestion>[0],
      {
        id: "suggestion-1",
        name: "리엔",
        type: "CHARACTER",
        summary: "더 긴 최신 요약",
        aliases: ["검은 기사", "리엔 경"],
      },
      "project-1"
    );

    expect(result).toEqual({ error: null, entityId: "entity-1" });
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "update",
        payload: {
          summary: "더 긴 최신 요약",
          aliases: ["검은기사", "리엔 경"],
        },
        eq: [{ column: "id", value: "entity-1" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({
          status: "CONFIRMED",
          matched_entity_id: "entity-1",
        }),
        eq: [{ column: "id", value: "suggestion-1" }],
      })
    );
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("inserts a new entity, confirms the suggestion, and schedules embedding", async () => {
    const { client, operations } = createConfirmClient({
      insertedEntity: { id: "entity-new" },
    });
    const background = createConfirmClient();
    createClientMock.mockResolvedValue(background.client);

    const result = await confirmEntitySuggestion(
      client as unknown as Parameters<typeof confirmEntitySuggestion>[0],
      {
        id: "suggestion-2",
        name: "검은 서고",
        type: "PLACE",
        summary: "금서가 보관된 장소",
        aliases: ["흑서고"],
      },
      "project-1"
    );

    expect(result).toEqual({ error: null, entityId: "entity-new" });
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "insert",
        payload: {
          project_id: "project-1",
          name: "검은 서고",
          type: "PLACE",
          summary: "금서가 보관된 장소",
          aliases: ["흑서고"],
          metadata: { importance: "MINOR" },
        },
      })
    );
    expect(afterMock).toHaveBeenCalledTimes(1);

    await afterMock.mock.calls[0][0]();

    expect(embedTextMock).toHaveBeenCalledWith(
      "검은 서고 금서가 보관된 장소 흑서고",
      expect.objectContaining({ onComplete: expect.any(Function) })
    );
    expect(background.operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "update",
        payload: { embedding: JSON.stringify([0.1, 0.2, 0.3]) },
        eq: [{ column: "id", value: "entity-new" }],
      })
    );
  });

  it("uses overrides and ignores malformed suggestion aliases", async () => {
    const { client, operations } = createConfirmClient({
      insertedEntity: { id: "entity-override" },
    });

    await confirmEntitySuggestion(
      client as unknown as Parameters<typeof confirmEntitySuggestion>[0],
      {
        id: "suggestion-3",
        name: "초안 이름",
        type: "CONCEPT",
        summary: null,
        aliases: { invalid: true },
      },
      "project-1",
      {
        name: "수정 이름",
        type: "ITEM",
        summary: "수정 요약",
        aliases: ["수정 별칭"],
      }
    );

    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "insert",
        payload: expect.objectContaining({
          name: "수정 이름",
          type: "ITEM",
          summary: "수정 요약",
          aliases: ["수정 별칭"],
        }),
      })
    );
  });

  it("returns insert and status errors without hiding the database message", async () => {
    const insertClient = createConfirmClient({
      insertError: { message: "insert failed" },
    });
    await expect(
      confirmEntitySuggestion(
        insertClient.client as unknown as Parameters<typeof confirmEntitySuggestion>[0],
        {
          id: "suggestion-insert-error",
          name: "리엔",
          type: "CHARACTER",
          summary: null,
          aliases: [],
        },
        "project-1"
      )
    ).resolves.toEqual({ error: "insert failed" });

    const statusClient = createConfirmClient({
      insertedEntity: { id: "entity-new" },
      statusError: { message: "status failed" },
    });
    await expect(
      confirmEntitySuggestion(
        statusClient.client as unknown as Parameters<typeof confirmEntitySuggestion>[0],
        {
          id: "suggestion-status-error",
          name: "카이",
          type: "CHARACTER",
          summary: null,
          aliases: [],
        },
        "project-1"
      )
    ).resolves.toEqual({ error: "status failed" });
  });
});
