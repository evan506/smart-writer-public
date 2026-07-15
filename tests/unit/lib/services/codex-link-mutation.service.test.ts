import { describe, expect, it } from "vitest";
import {
  createCodexEntityLink,
  deleteCodexEntityLink,
  updateCodexEntityLink,
} from "@/lib/services/codex/link-mutation.service";

type QueryOperation = {
  table: string;
  type?: "insert" | "update" | "delete";
  payload?: unknown;
  eq: { column: string; value: unknown }[];
};

function createLinkMutationClient({
  insertError = null,
  updateError = null,
  deleteError = null,
}: {
  insertError?: { message: string; code?: string } | null;
  updateError?: { message: string; code?: string } | null;
  deleteError?: { message: string; code?: string } | null;
} = {}) {
  const operations: QueryOperation[] = [];

  const client = {
    from(table: string) {
      const operation: QueryOperation = { table, eq: [] };
      operations.push(operation);

      const builder = {
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
        then(
          resolve: (value: { data: null; error: { message: string; code?: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          const error =
            operation.type === "insert"
              ? insertError
              : operation.type === "update"
                ? updateError
                : deleteError;
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        },
      };

      return builder;
    },
  };

  return { client, operations };
}

describe("codex link mutation service", () => {
  it("creates an entity link with relation metadata", async () => {
    const { client, operations } = createLinkMutationClient();

    await expect(
      createCodexEntityLink(
        client as unknown as Parameters<typeof createCodexEntityLink>[0],
        {
          fromId: "entity-from",
          toId: "entity-to",
          relationType: "ALLY",
          direction: "BI",
          weight: 0.8,
        }
      )
    ).resolves.toEqual({ error: null });

    expect(operations).toEqual([
      {
        table: "entity_links",
        type: "insert",
        payload: {
          from_id: "entity-from",
          to_id: "entity-to",
          relation_type: "ALLY",
          direction: "BI",
          weight: 0.8,
        },
        eq: [],
      },
    ]);
  });

  it("maps duplicate link inserts to the existing Korean validation message", async () => {
    const { client } = createLinkMutationClient({
      insertError: { code: "23505", message: "duplicate key value" },
    });

    await expect(
      createCodexEntityLink(
        client as unknown as Parameters<typeof createCodexEntityLink>[0],
        {
          fromId: "entity-from",
          toId: "entity-to",
          relationType: "ALLY",
          direction: "UNI",
          weight: 0.5,
        }
      )
    ).resolves.toEqual({ error: "이미 등록된 관계입니다" });
  });

  it("updates an entity link relation type", async () => {
    const { client, operations } = createLinkMutationClient();

    await expect(
      updateCodexEntityLink(
        client as unknown as Parameters<typeof updateCodexEntityLink>[0],
        "link-1",
        "ENEMY"
      )
    ).resolves.toEqual({ error: null });

    expect(operations).toEqual([
      {
        table: "entity_links",
        type: "update",
        payload: { relation_type: "ENEMY" },
        eq: [{ column: "id", value: "link-1" }],
      },
    ]);
  });

  it("deletes an entity link by id", async () => {
    const { client, operations } = createLinkMutationClient();

    await expect(
      deleteCodexEntityLink(
        client as unknown as Parameters<typeof deleteCodexEntityLink>[0],
        "link-1"
      )
    ).resolves.toEqual({ error: null });

    expect(operations).toEqual([
      {
        table: "entity_links",
        type: "delete",
        eq: [{ column: "id", value: "link-1" }],
      },
    ]);
  });

  it("preserves database errors for update and delete failures", async () => {
    const updateClient = createLinkMutationClient({
      updateError: { message: "update failed" },
    });
    await expect(
      updateCodexEntityLink(
        updateClient.client as unknown as Parameters<typeof updateCodexEntityLink>[0],
        "link-1",
        "ENEMY"
      )
    ).resolves.toEqual({ error: "update failed" });

    const deleteClient = createLinkMutationClient({
      deleteError: { message: "delete failed" },
    });
    await expect(
      deleteCodexEntityLink(
        deleteClient.client as unknown as Parameters<typeof deleteCodexEntityLink>[0],
        "link-1"
      )
    ).resolves.toEqual({ error: "delete failed" });
  });
});
