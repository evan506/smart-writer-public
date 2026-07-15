import { describe, expect, it } from "vitest";
import {
  dismissPendingSuggestionsForProject,
  dismissSuggestionAndAppendExcludedTerm,
  dismissSuggestionById,
} from "@/lib/services/suggestions/dismiss.service";

type QueryOperation = {
  table: string;
  type?: "select" | "update";
  selectColumns?: string;
  payload?: unknown;
  eq: { column: string; value: unknown }[];
};

function createDismissClient({
  project = { excluded_terms: ["검은기사"] },
  suggestionUpdateError = null,
  projectUpdateError = null,
}: {
  project?: { excluded_terms: unknown } | null;
  suggestionUpdateError?: { message: string } | null;
  projectUpdateError?: { message: string } | null;
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
        update(payload: unknown) {
          operation.type = "update";
          operation.payload = payload;
          return builder;
        },
        eq(column: string, value: unknown) {
          operation.eq.push({ column, value });
          return builder;
        },
        async single() {
          return { data: project, error: null };
        },
        then(
          resolve: (value: { data: null; error: { message: string } | null }) => unknown,
          reject?: (reason: unknown) => unknown
        ) {
          const error =
            operation.table === "entity_suggestions"
              ? suggestionUpdateError
              : projectUpdateError;
          return Promise.resolve({ data: null, error }).then(resolve, reject);
        },
      };

      return builder;
    },
  };

  return { client, operations };
}

describe("suggestions dismiss service", () => {
  it("dismisses a single suggestion by id", async () => {
    const { client, operations } = createDismissClient();

    const result = await dismissSuggestionById(
      client as unknown as Parameters<typeof dismissSuggestionById>[0],
      "suggestion-1"
    );

    expect(result).toEqual({ error: null });
    expect(operations).toEqual([
      {
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({ status: "DISMISSED" }),
        eq: [{ column: "id", value: "suggestion-1" }],
      },
    ]);
  });

  it("dismisses and appends a new excluded term", async () => {
    const { client, operations } = createDismissClient({
      project: { excluded_terms: ["검은기사"] },
    });

    const result = await dismissSuggestionAndAppendExcludedTerm(
      client as unknown as Parameters<typeof dismissSuggestionAndAppendExcludedTerm>[0],
      { id: "suggestion-2", name: "흑기사" },
      "project-1"
    );

    expect(result).toEqual({ error: null });
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({ status: "DISMISSED" }),
        eq: [{ column: "id", value: "suggestion-2" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "projects",
        type: "select",
        selectColumns: "excluded_terms",
        eq: [{ column: "id", value: "project-1" }],
      })
    );
    expect(operations).toContainEqual(
      expect.objectContaining({
        table: "projects",
        type: "update",
        payload: { excluded_terms: ["검은기사", "흑기사"] },
        eq: [{ column: "id", value: "project-1" }],
      })
    );
  });

  it("does not rewrite excluded terms when the normalized term already exists", async () => {
    const { client, operations } = createDismissClient({
      project: { excluded_terms: ["흑 기사"] },
    });

    const result = await dismissSuggestionAndAppendExcludedTerm(
      client as unknown as Parameters<typeof dismissSuggestionAndAppendExcludedTerm>[0],
      { id: "suggestion-3", name: "흑기사" },
      "project-1"
    );

    expect(result).toEqual({ error: null });
    expect(
      operations.filter(
        (operation) => operation.table === "projects" && operation.type === "update"
      )
    ).toEqual([]);
  });

  it("dismisses all pending suggestions for a project", async () => {
    const { client, operations } = createDismissClient();

    const result = await dismissPendingSuggestionsForProject(
      client as unknown as Parameters<typeof dismissPendingSuggestionsForProject>[0],
      "project-1"
    );

    expect(result).toEqual({ error: null });
    expect(operations).toEqual([
      {
        table: "entity_suggestions",
        type: "update",
        payload: expect.objectContaining({ status: "DISMISSED" }),
        eq: [
          { column: "project_id", value: "project-1" },
          { column: "status", value: "PENDING" },
        ],
      },
    ]);
  });

  it("returns database errors from dismiss and exclude updates", async () => {
    const suggestionErrorClient = createDismissClient({
      suggestionUpdateError: { message: "dismiss failed" },
    });

    await expect(
      dismissSuggestionById(
        suggestionErrorClient.client as unknown as Parameters<typeof dismissSuggestionById>[0],
        "suggestion-error"
      )
    ).resolves.toEqual({ error: "dismiss failed" });

    const projectErrorClient = createDismissClient({
      projectUpdateError: { message: "exclude failed" },
    });

    await expect(
      dismissSuggestionAndAppendExcludedTerm(
        projectErrorClient.client as unknown as Parameters<typeof dismissSuggestionAndAppendExcludedTerm>[0],
        { id: "suggestion-exclude-error", name: "새 이름" },
        "project-1"
      )
    ).resolves.toEqual({ error: "exclude failed" });
  });
});
