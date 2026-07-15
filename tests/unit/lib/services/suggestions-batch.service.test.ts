import { beforeEach, describe, expect, it, vi } from "vitest";
import { confirmEntitySuggestionBatch } from "@/lib/services/suggestions/batch.service";

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
  in: { column: string; values: unknown[] }[];
};

function createBatchClient({
  existingRows = [],
  existingError = null,
  insertedRows = [],
  insertError = null,
  entityUpdateError = null,
  statusError = null,
}: {
  existingRows?: { id: string; name: string; summary: string | null; aliases: unknown }[];
  existingError?: { message: string } | null;
  insertedRows?: { id: string; name: string; summary: string | null; aliases: unknown }[];
  insertError?: { message: string } | null;
  entityUpdateError?: { message: string } | null;
  statusError?: { message: string } | null;
} = {}) {
  const operations: QueryOperation[] = [];

  const client = {
    from(table: string) {
      const operation: QueryOperation = { table, eq: [], in: [] };
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
        in(column: string, values: unknown[]) {
          operation.in.push({ column, values });
          return builder;
        },
        then(
          resolve: (value: { data: unknown; error: { message: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          let result = { data: null as unknown, error: null as { message: string } | null };
          if (operation.table === "entities" && operation.type === "select") {
            result = { data: existingRows, error: existingError };
          } else if (operation.table === "entities" && operation.type === "insert") {
            result = { data: insertedRows, error: insertError };
          } else if (operation.table === "entities" && operation.type === "update") {
            result = { data: null, error: entityUpdateError };
          } else if (operation.table === "entity_suggestions" && operation.type === "update") {
            result = { data: null, error: statusError };
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };

      return builder;
    },
  };

  return { client, operations };
}

describe("suggestions batch service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedTextMock.mockResolvedValue([0.1, 0.2, 0.3]);
  });

  it("merges existing entities, inserts new rows, updates suggestion statuses, and schedules embeddings", async () => {
    const { client, operations } = createBatchClient({
      existingRows: [
        {
          id: "entity-existing",
          name: "리엔",
          summary: "짧은 요약",
          aliases: ["검은기사"],
        },
      ],
      insertedRows: [
        {
          id: "entity-new",
          name: "검은 서고",
          summary: "금서가 보관된 장소",
          aliases: ["흑서고"],
        },
      ],
    });
    const background = createBatchClient();
    createClientMock.mockResolvedValue(background.client);

    const result = await confirmEntitySuggestionBatch(
      client as unknown as Parameters<typeof confirmEntitySuggestionBatch>[0],
      [
        {
          id: "suggestion-existing",
          name: "리엔",
          type: "CHARACTER",
          summary: "더 긴 최신 요약",
          aliases: ["검은 기사", "리엔 경"],
        },
        {
          id: "suggestion-new",
          name: "검은 서고",
          type: "PLACE",
          summary: "금서가 보관된 장소",
          aliases: ["흑서고"],
        },
        {
          id: "suggestion-merge",
          name: "리엔 경",
          type: "CHARACTER",
          summary: null,
          aliases: [],
          suggested_action: "MERGE",
        },
      ],
      "project-1"
    );

    expect(result).toEqual({ error: null, confirmed: 2, skippedMerge: 1 });
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "update",
        payload: {
          summary: "더 긴 최신 요약",
          aliases: ["검은기사", "리엔 경"],
        },
        eq: [{ column: "id", value: "entity-existing" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "insert",
        payload: [
          {
            project_id: "project-1",
            name: "검은 서고",
            type: "PLACE",
            summary: "금서가 보관된 장소",
            aliases: ["흑서고"],
            metadata: { importance: "MINOR" },
          },
        ],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({
          status: "CONFIRMED",
          matched_entity_id: "entity-existing",
        }),
        in: [{ column: "id", values: ["suggestion-existing"] }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({
          status: "CONFIRMED",
          matched_entity_id: "entity-new",
        }),
        in: [{ column: "id", values: ["suggestion-new"] }],
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

  it("skips targetless merge suggestions without querying existing entities", async () => {
    const { client, operations } = createBatchClient();

    const result = await confirmEntitySuggestionBatch(
      client as unknown as Parameters<typeof confirmEntitySuggestionBatch>[0],
      [
        {
          id: "suggestion-merge",
          name: "리엔 경",
          type: "CHARACTER",
          summary: null,
          aliases: [],
          suggested_action: "MERGE",
        },
      ],
      "project-1"
    );

    expect(result).toEqual({ error: null, confirmed: 0, skippedMerge: 1 });
    expect(operations).toEqual([]);
  });

  it("returns database errors without hiding the database message", async () => {
    const existingErrorClient = createBatchClient({
      existingError: { message: "existing failed" },
    });
    await expect(
      confirmEntitySuggestionBatch(
        existingErrorClient.client as unknown as Parameters<typeof confirmEntitySuggestionBatch>[0],
        [
          {
            id: "suggestion-existing-error",
            name: "리엔",
            type: "CHARACTER",
            summary: null,
            aliases: [],
          },
        ],
        "project-1"
      )
    ).resolves.toEqual({ error: "existing failed", confirmed: 0, skippedMerge: 0 });

    const insertErrorClient = createBatchClient({
      insertError: { message: "insert failed" },
    });
    await expect(
      confirmEntitySuggestionBatch(
        insertErrorClient.client as unknown as Parameters<typeof confirmEntitySuggestionBatch>[0],
        [
          {
            id: "suggestion-insert-error",
            name: "검은 서고",
            type: "PLACE",
            summary: null,
            aliases: [],
          },
        ],
        "project-1"
      )
    ).resolves.toEqual({ error: "insert failed", confirmed: 0, skippedMerge: 0 });

    const statusErrorClient = createBatchClient({
      insertedRows: [
        {
          id: "entity-new",
          name: "검은 서고",
          summary: null,
          aliases: [],
        },
      ],
      statusError: { message: "status failed" },
    });
    await expect(
      confirmEntitySuggestionBatch(
        statusErrorClient.client as unknown as Parameters<typeof confirmEntitySuggestionBatch>[0],
        [
          {
            id: "suggestion-status-error",
            name: "검은 서고",
            type: "PLACE",
            summary: null,
            aliases: [],
          },
        ],
        "project-1"
      )
    ).resolves.toEqual({ error: "status failed", confirmed: 0, skippedMerge: 0 });
  });
});
