import { describe, expect, it } from "vitest";
import {
  confirmRelationSuggestion,
  confirmRelationSuggestionBatch,
} from "@/lib/services/suggestions/relation.service";

type QueryOperation = {
  table: string;
  type?: "select" | "update" | "upsert";
  selectColumns?: string;
  payload?: unknown;
  options?: unknown;
  eq: { column: string; value: unknown }[];
  in: { column: string; values: unknown[] }[];
};

function createRelationClient({
  entities = [],
  entitiesError = null,
  linkError = null,
  statusError = null,
}: {
  entities?: { id: string; name: string }[];
  entitiesError?: { message: string } | null;
  linkError?: { message: string } | null;
  statusError?: { message: string } | null;
} = {}) {
  const operations: QueryOperation[] = [];

  const client = {
    from(table: string) {
      const operation: QueryOperation = { table, eq: [], in: [] };
      operations.push(operation);

      const builder = {
        select(columns: string) {
          operation.type = "select";
          operation.selectColumns = columns;
          return builder;
        },
        update(payload: unknown) {
          operation.type = "update";
          operation.payload = payload;
          return builder;
        },
        upsert(payload: unknown, options: unknown) {
          operation.type = "upsert";
          operation.payload = payload;
          operation.options = options;
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
            result = { data: entities, error: entitiesError };
          } else if (operation.table === "entity_links" && operation.type === "upsert") {
            result = { data: null, error: linkError };
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

describe("suggestions relation service", () => {
  it("confirms a relation with an idempotent upsert and status update", async () => {
    const { client, operations } = createRelationClient({
      entities: [
        { id: "entity-from", name: "리엔" },
        { id: "entity-to", name: "검은 서고" },
      ],
    });

    const result = await confirmRelationSuggestion(
      client as unknown as Parameters<typeof confirmRelationSuggestion>[0],
      {
        id: "suggestion-1",
        aliases: {
          from_name: "리엔",
          to_name: "검은 서고",
          relation_type: "PROTECTS",
          direction: "BI",
          weight: 0.9,
        },
      },
      "project-1"
    );

    expect(result).toEqual({ error: null });
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_links",
        type: "upsert",
        payload: {
          from_id: "entity-from",
          to_id: "entity-to",
          relation_type: "PROTECTS",
          direction: "BI",
          weight: 0.9,
        },
        options: {
          onConflict: "from_id,to_id,relation_type",
          ignoreDuplicates: true,
        },
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({ status: "CONFIRMED" }),
        eq: [{ column: "id", value: "suggestion-1" }],
      })
    );
  });

  it("returns metadata and missing endpoint errors before writing links", async () => {
    const malformed = createRelationClient();
    await expect(
      confirmRelationSuggestion(
        malformed.client as unknown as Parameters<typeof confirmRelationSuggestion>[0],
        { id: "suggestion-bad-meta", aliases: null },
        "project-1"
      )
    ).resolves.toEqual({ error: "관계 메타데이터가 올바르지 않습니다" });
    expect(malformed.operations).toEqual([]);

    const missingEndpoint = createRelationClient({
      entities: [{ id: "entity-from", name: "리엔" }],
    });
    await expect(
      confirmRelationSuggestion(
        missingEndpoint.client as unknown as Parameters<typeof confirmRelationSuggestion>[0],
        {
          id: "suggestion-missing",
          aliases: {
            from_name: "리엔",
            to_name: "검은 서고",
            relation_type: "PROTECTS",
            direction: "UNI",
            weight: 0.5,
          },
        },
        "project-1"
      )
    ).resolves.toEqual({
      error: "작품 기억 항목을 찾을 수 없습니다: 검은 서고. 먼저 해당 작품 기억 항목을 저장하세요.",
    });
    expect(missingEndpoint.operations).not.toContainEqual(
      expect.objectContaining({ table: "entity_links" })
    );
  });

  it("batch confirms valid relations and dismisses invalid relation suggestions", async () => {
    const { client, operations } = createRelationClient({
      entities: [
        { id: "entity-from", name: "리엔" },
        { id: "entity-to", name: "검은 서고" },
      ],
    });

    const result = await confirmRelationSuggestionBatch(
      client as unknown as Parameters<typeof confirmRelationSuggestionBatch>[0],
      [
        {
          id: "suggestion-valid",
          aliases: {
            from_name: "리엔",
            to_name: "검은 서고",
            relation_type: "LOCATED_AT",
            direction: "SIDEWAYS",
            weight: 0.7,
          },
        },
        {
          id: "suggestion-invalid",
          aliases: {
            from_name: "리엔",
            to_name: "없는 장소",
            relation_type: "LOCATED_AT",
          },
        },
      ],
      "project-1"
    );

    expect(result).toEqual({ error: null, confirmed: 1 });
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_links",
        type: "upsert",
        payload: [
          {
            from_id: "entity-from",
            to_id: "entity-to",
            relation_type: "LOCATED_AT",
            direction: "UNI",
            weight: 0.7,
          },
        ],
        options: {
          onConflict: "from_id,to_id,relation_type",
          ignoreDuplicates: true,
        },
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({ status: "CONFIRMED" }),
        in: [{ column: "id", values: ["suggestion-valid"] }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({ status: "DISMISSED" }),
        in: [{ column: "id", values: ["suggestion-invalid"] }],
      })
    );
  });

  it("returns database errors without confirming relation suggestions", async () => {
    const entityErrorClient = createRelationClient({
      entitiesError: { message: "entities failed" },
    });
    await expect(
      confirmRelationSuggestionBatch(
        entityErrorClient.client as unknown as Parameters<typeof confirmRelationSuggestionBatch>[0],
        [{ id: "suggestion-1", aliases: {} }],
        "project-1"
      )
    ).resolves.toEqual({ error: "entities failed", confirmed: 0 });

    const linkErrorClient = createRelationClient({
      entities: [
        { id: "entity-from", name: "리엔" },
        { id: "entity-to", name: "검은 서고" },
      ],
      linkError: { message: "link failed" },
    });
    await expect(
      confirmRelationSuggestion(
        linkErrorClient.client as unknown as Parameters<typeof confirmRelationSuggestion>[0],
        {
          id: "suggestion-link-error",
          aliases: {
            from_name: "리엔",
            to_name: "검은 서고",
            relation_type: "PROTECTS",
            direction: "UNI",
            weight: 0.5,
          },
        },
        "project-1"
      )
    ).resolves.toEqual({ error: "link failed" });
    expect(linkErrorClient.operations).not.toContainEqual(
      expect.objectContaining({ table: "entity_suggestions" })
    );
  });
});
