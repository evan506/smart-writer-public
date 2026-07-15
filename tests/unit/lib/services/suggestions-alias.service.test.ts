import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  confirmSuggestionAlias,
  rejectSuggestionAliasTarget,
} from "@/lib/services/suggestions/alias.service";

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
  type?: "update";
  payload?: unknown;
  eq: { column: string; value: unknown }[];
};

function createAliasClient({
  entityUpdateError = null,
  suggestionUpdateError = null,
}: {
  entityUpdateError?: { message: string } | null;
  suggestionUpdateError?: { message: string } | null;
} = {}) {
  const operations: QueryOperation[] = [];

  const client = {
    from(table: string) {
      const operation: QueryOperation = { table, eq: [] };
      operations.push(operation);

      const builder = {
        update(payload: unknown) {
          operation.type = "update";
          operation.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          operation.eq.push({ column, value });
          return builder;
        },
        then(
          resolve: (value: { data: null; error: { message: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          const error =
            operation.table === "entities"
              ? entityUpdateError
              : suggestionUpdateError;
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        },
      };

      return builder;
    },
  };

  return { client, operations };
}

describe("suggestions alias service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    embedTextMock.mockResolvedValue([0.4, 0.5, 0.6]);
  });

  it("merges suggestion names into target aliases and confirms the suggestion", async () => {
    const { client, operations } = createAliasClient();
    const background = createAliasClient();
    createClientMock.mockResolvedValue(background.client);

    const result = await confirmSuggestionAlias(
      client as unknown as Parameters<typeof confirmSuggestionAlias>[0],
      {
        id: "suggestion-1",
        name: "흑기사",
        aliases: ["검은 기사", "리엔 경"],
      },
      {
        id: "entity-1",
        name: "리엔",
        summary: "북부 기사단장",
        aliases: ["검은 기사"],
      }
    );

    expect(result).toEqual({ error: null, targetName: "리엔" });
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "update",
        payload: { aliases: ["검은 기사", "흑기사", "리엔 경"] },
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
          suggested_action: "MERGE",
        }),
        eq: [{ column: "id", value: "suggestion-1" }],
      })
    );

    expect(afterMock).toHaveBeenCalledTimes(1);
    await afterMock.mock.calls[0][0]();

    expect(embedTextMock).toHaveBeenCalledWith(
      "리엔 북부 기사단장 검은 기사 흑기사 리엔 경",
      expect.anything()
    );
    expect(background.operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        type: "update",
        payload: { embedding: JSON.stringify([0.4, 0.5, 0.6]) },
        eq: [{ column: "id", value: "entity-1" }],
      })
    );
  });

  it("ignores malformed suggestion aliases", async () => {
    const { client, operations } = createAliasClient();

    await confirmSuggestionAlias(
      client as unknown as Parameters<typeof confirmSuggestionAlias>[0],
      { id: "suggestion-2", name: "서고", aliases: { invalid: true } },
      { id: "entity-2", name: "검은 서고", summary: null, aliases: null }
    );

    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entities",
        payload: { aliases: ["서고"] },
      })
    );
  });

  it("clears a rejected alias target", async () => {
    const { client, operations } = createAliasClient();

    const result = await rejectSuggestionAliasTarget(
      client as unknown as Parameters<typeof rejectSuggestionAliasTarget>[0],
      "suggestion-3"
    );

    expect(result).toEqual({ error: null });
    expect(operations).toEqual([
      {
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({ matched_entity_id: null }),
        eq: [{ column: "id", value: "suggestion-3" }],
      },
    ]);
  });

  it("returns database errors before scheduling background embedding", async () => {
    const entityErrorClient = createAliasClient({
      entityUpdateError: { message: "entity failed" },
    });

    await expect(
      confirmSuggestionAlias(
        entityErrorClient.client as unknown as Parameters<typeof confirmSuggestionAlias>[0],
        { id: "suggestion-entity-error", name: "리엔", aliases: [] },
        { id: "entity-1", name: "리엔", summary: null, aliases: [] }
      )
    ).resolves.toEqual({ error: "entity failed" });

    const suggestionErrorClient = createAliasClient({
      suggestionUpdateError: { message: "suggestion failed" },
    });

    await expect(
      confirmSuggestionAlias(
        suggestionErrorClient.client as unknown as Parameters<typeof confirmSuggestionAlias>[0],
        { id: "suggestion-status-error", name: "리엔", aliases: [] },
        { id: "entity-1", name: "리엔", summary: null, aliases: [] }
      )
    ).resolves.toEqual({ error: "suggestion failed" });

    expect(afterMock).not.toHaveBeenCalled();
  });
});
