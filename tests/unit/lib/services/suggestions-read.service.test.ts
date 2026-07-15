import { describe, expect, it } from "vitest";
import {
  countPendingSuggestions,
  getChapterExtractionSummary,
  listPendingSuggestions,
  listSuggestionAliasTargets,
} from "@/lib/services/suggestions/read.service";

type QueryCall =
  | { method: "from"; table: string }
  | { method: "select"; columns: string; options?: unknown }
  | { method: "eq"; column: string; value: unknown }
  | { method: "gte"; column: string; value: unknown }
  | { method: "order"; column: string; options?: unknown };

function createServiceClient(result: {
  data?: unknown;
  count?: number | null;
  error?: { message: string } | null;
}) {
  const calls: QueryCall[] = [];

  const builder = {
    select(columns: string, options?: unknown) {
      calls.push({ method: "select", columns, options });
      return builder;
    },
    eq(column: string, value: unknown) {
      calls.push({ method: "eq", column, value });
      return builder;
    },
    gte(column: string, value: unknown) {
      calls.push({ method: "gte", column, value });
      return builder;
    },
    order(column: string, options?: unknown) {
      calls.push({ method: "order", column, options });
      return builder;
    },
    then(
      resolve: (value: {
        data: unknown;
        count?: number | null;
        error: { message: string } | null;
      }) => unknown,
      reject?: (reason: unknown) => unknown
    ) {
      return Promise.resolve({
        data: result.data ?? null,
        count: result.count,
        error: result.error ?? null,
      }).then(resolve, reject);
    },
  };

  const client = {
    from(table: string) {
      calls.push({ method: "from", table });
      return builder;
    },
  };

  return { client, calls };
}

describe("suggestions read service", () => {
  it("lists pending suggestions by descending confidence", async () => {
    const rows = [{ id: "suggestion-1", confidence: 0.91 }];
    const { client, calls } = createServiceClient({ data: rows });

    const result = await listPendingSuggestions(
      client as unknown as Parameters<typeof listPendingSuggestions>[0],
      "project-1"
    );

    expect(result).toEqual({ error: null, suggestions: rows });
    expect(calls).toEqual([
      { method: "from", table: "entity_suggestions" },
      { method: "select", columns: "*" },
      { method: "eq", column: "project_id", value: "project-1" },
      { method: "eq", column: "status", value: "PENDING" },
      { method: "order", column: "confidence", options: { ascending: false } },
    ]);
  });

  it("returns zero when pending suggestion count fails", async () => {
    const { client } = createServiceClient({
      count: null,
      error: { message: "count failed" },
    });

    await expect(
      countPendingSuggestions(
        client as unknown as Parameters<typeof countPendingSuggestions>[0],
        "project-1"
      )
    ).resolves.toBe(0);
  });

  it("maps alias targets and drops malformed aliases", async () => {
    const { client } = createServiceClient({
      data: [
        {
          id: "entity-1",
          name: "리엔",
          type: "CHARACTER",
          aliases: ["검은 기사"],
        },
        {
          id: "entity-2",
          name: "검은 서고",
          type: "PLACE",
          aliases: null,
        },
      ],
    });

    const result = await listSuggestionAliasTargets(
      client as unknown as Parameters<typeof listSuggestionAliasTargets>[0],
      "project-1"
    );

    expect(result).toEqual({
      error: null,
      entities: [
        {
          id: "entity-1",
          name: "리엔",
          type: "CHARACTER",
          aliases: ["검은 기사"],
        },
        {
          id: "entity-2",
          name: "검은 서고",
          type: "PLACE",
          aliases: [],
        },
      ],
    });
  });

  it("summarizes chapter extraction rows since a timestamp", async () => {
    const { client, calls } = createServiceClient({
      data: [
        { id: "pending", name: "대기", type: "CHARACTER", status: "PENDING" },
        { id: "entity", name: "리엔", type: "CHARACTER", status: "CONFIRMED" },
        { id: "relation", name: "리엔-서고", type: "RELATION", status: "CONFIRMED" },
      ],
    });

    const result = await getChapterExtractionSummary(
      client as unknown as Parameters<typeof getChapterExtractionSummary>[0],
      "project-1",
      "chapter-1",
      "2026-05-21T00:00:00.000Z"
    );

    expect(result).toEqual({
      error: null,
      pendingCount: 1,
      autoConfirmedEntityCount: 1,
      autoConfirmedRelationCount: 1,
      confirmedNames: ["리엔"],
    });
    expect(calls).toContainEqual({
      method: "gte",
      column: "updated_at",
      value: "2026-05-21T00:00:00.000Z",
    });
  });
});
