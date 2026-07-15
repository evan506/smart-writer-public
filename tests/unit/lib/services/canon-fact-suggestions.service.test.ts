import { describe, expect, it } from "vitest";
import {
  approveFactSuggestion,
  listPendingFactSuggestions,
  supersedeFactSuggestion,
} from "@/lib/services/canon-facts/suggestions.service";

type MockResponse = { data?: unknown; error?: { message: string; code?: string } | null };

function createSupabaseMock(responses: MockResponse[]) {
  const operations: Array<{ table: string; method: string; args: unknown[] }> = [];

  class Query {
    constructor(private readonly table: string) {}

    select(...args: unknown[]) {
      operations.push({ table: this.table, method: "select", args });
      return this;
    }

    insert(...args: unknown[]) {
      operations.push({ table: this.table, method: "insert", args });
      return this;
    }

    update(...args: unknown[]) {
      operations.push({ table: this.table, method: "update", args });
      return this;
    }

    eq(...args: unknown[]) {
      operations.push({ table: this.table, method: "eq", args });
      return this;
    }

    in(...args: unknown[]) {
      operations.push({ table: this.table, method: "in", args });
      return this;
    }

    is(...args: unknown[]) {
      operations.push({ table: this.table, method: "is", args });
      return this;
    }

    limit(...args: unknown[]) {
      operations.push({ table: this.table, method: "limit", args });
      return this;
    }

    order(...args: unknown[]) {
      operations.push({ table: this.table, method: "order", args });
      return this;
    }

    single() {
      operations.push({ table: this.table, method: "single", args: [] });
      return Promise.resolve(responses.shift() ?? { data: null, error: null });
    }

    maybeSingle() {
      operations.push({ table: this.table, method: "maybeSingle", args: [] });
      return Promise.resolve(responses.shift() ?? { data: null, error: null });
    }

    then<TResult1 = MockResponse, TResult2 = never>(
      onfulfilled?: ((value: MockResponse) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(responses.shift() ?? { data: null, error: null }).then(
        onfulfilled,
        onrejected
      );
    }
  }

  return {
    client: {
      rpc(...args: unknown[]) {
        operations.push({ table: "rpc", method: "rpc", args });
        return Promise.resolve(responses.shift() ?? { data: null, error: null });
      },
      from(table: string) {
        operations.push({ table, method: "from", args: [] });
        return new Query(table);
      },
    },
    operations,
  };
}

const pendingSupersedeSuggestion = {
  id: "suggestion-1",
  project_id: "project-1",
  chapter_id: "chapter-2",
  matched_entity_id: "entity-1",
  entity_suggestion_id: null,
  fact_type: "ATTRIBUTE",
  fact_key: "species",
  value: "인간이다",
  evidence_text: "리엔은 인간이라고 불렸다.",
  confidence: 0.74,
  status: "PENDING",
};

const approvedConflictFact = {
  id: "fact-old",
  project_id: "project-1",
  entity_id: "entity-1",
  fact_type: "ATTRIBUTE",
  fact_key: "species",
  value: "하이엘프다",
  status: "APPROVED",
};

describe("canon fact suggestions service", () => {
  it("marks pending suggestions that will add evidence to an existing active fact", async () => {
    const { client, operations } = createSupabaseMock([
      {
        data: [
          {
            id: "suggestion-1",
            project_id: "project-1",
            chapter_id: "chapter-1",
            chapter_num: 2,
            chapter_title: "새 근거",
            entity_id: "entity-1",
            entity_name: "리엔",
            entity_suggestion_id: null,
            entity_suggestion_name: null,
            fact_type: "ROLE",
            fact_key: "title",
            value: "변방 마을의 영주다",
            evidence_text: "다른 회차에서도 영주라고 불렸다.",
            confidence: 0.86,
            can_approve: true,
            existing_fact_id: "fact-existing",
            existing_source_count: 2,
            conflicting_fact_id: null,
            conflicting_value: null,
            approval_mode: "ADD_SOURCE",
          },
        ],
        error: null,
      },
    ]);

    const result = await listPendingFactSuggestions(client as never, "project-1");

    expect(result.error).toBeNull();
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        id: "suggestion-1",
        entityName: "리엔",
        existingFactId: "fact-existing",
        existingSourceCount: 2,
        conflictingFactId: null,
        conflictingValue: null,
        approvalMode: "ADD_SOURCE",
        canApprove: true,
      }),
    ]);
    expect(operations).toEqual([
      {
        table: "rpc",
        method: "rpc",
        args: ["list_pending_fact_review_items", { p_project_id: "project-1" }],
      },
    ]);
  });

  it("maps conflicting approved fact previews from the review RPC", async () => {
    const { client } = createSupabaseMock([
      {
        data: [
          {
            id: "suggestion-1",
            project_id: "project-1",
            chapter_id: "chapter-1",
            chapter_num: 3,
            chapter_title: "충돌 후보",
            entity_id: "entity-1",
            entity_name: "리엔",
            entity_suggestion_id: null,
            entity_suggestion_name: null,
            fact_type: "ATTRIBUTE",
            fact_key: "species",
            value: "인간이다",
            evidence_text: "리엔은 인간이라고 불렸다.",
            confidence: 0.74,
            can_approve: true,
            existing_fact_id: null,
            existing_source_count: 0,
            conflicting_fact_id: "fact-conflict",
            conflicting_value: "하이엘프다",
            approval_mode: "CREATE_FACT",
          },
        ],
        error: null,
      },
    ]);

    const result = await listPendingFactSuggestions(client as never, "project-1");

    expect(result.error).toBeNull();
    expect(result.suggestions).toEqual([
      expect.objectContaining({
        id: "suggestion-1",
        approvalMode: "CREATE_FACT",
        conflictingFactId: "fact-conflict",
        conflictingValue: "하이엘프다",
      }),
    ]);
  });

  it("approves a pending fact suggestion into canon fact and source rows", async () => {
    const { client, operations } = createSupabaseMock([
      {
        data: {
          id: "suggestion-1",
          project_id: "project-1",
          chapter_id: "chapter-1",
          matched_entity_id: "entity-1",
          entity_suggestion_id: null,
          fact_type: "ROLE",
          fact_key: null,
          value: "변방 마을의 영주다",
          evidence_text: "리엔은 변방 마을의 영주였다.",
          confidence: 0.86,
          status: "PENDING",
        },
        error: null,
      },
      { data: [], error: null },
      { data: { id: "fact-1" }, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    const result = await approveFactSuggestion(
      client as never,
      "suggestion-1",
      "project-1"
    );

    expect(result).toEqual({ error: null, factId: "fact-1", mode: "created" });
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "canon_facts", method: "insert" }),
        expect.objectContaining({ table: "canon_fact_sources", method: "insert" }),
        expect.objectContaining({ table: "fact_suggestions", method: "update" }),
      ])
    );
  });

  it("adds source evidence to an existing active fact without inserting a duplicate fact", async () => {
    const { client, operations } = createSupabaseMock([
      {
        data: {
          id: "suggestion-1",
          project_id: "project-1",
          chapter_id: "chapter-1",
          matched_entity_id: "entity-1",
          entity_suggestion_id: null,
          fact_type: "ROLE",
          fact_key: null,
          value: "변방 마을의 영주다",
          evidence_text: "다른 회차에서도 영주라고 불렸다.",
          confidence: 0.86,
          status: "PENDING",
        },
        error: null,
      },
      { data: [{ id: "fact-existing" }], error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    const result = await approveFactSuggestion(
      client as never,
      "suggestion-1",
      "project-1"
    );

    expect(result).toEqual({
      error: null,
      factId: "fact-existing",
      mode: "source_added",
    });
    expect(
      operations.some(
        (operation) => operation.table === "canon_facts" && operation.method === "insert"
      )
    ).toBe(false);
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "canon_fact_sources", method: "insert" }),
        expect.objectContaining({ table: "fact_suggestions", method: "update" }),
      ])
    );
  });

  it("treats an empty fact key as null when matching existing active facts", async () => {
    const { client, operations } = createSupabaseMock([
      {
        data: {
          id: "suggestion-1",
          project_id: "project-1",
          chapter_id: "chapter-1",
          matched_entity_id: "entity-1",
          entity_suggestion_id: null,
          fact_type: "ATTRIBUTE",
          fact_key: "",
          value: "하이엘프다",
          evidence_text: "리엔은 하이엘프였다.",
          confidence: 0.82,
          status: "PENDING",
        },
        error: null,
      },
      { data: [{ id: "fact-existing" }], error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    const result = await approveFactSuggestion(
      client as never,
      "suggestion-1",
      "project-1"
    );

    expect(result).toEqual({
      error: null,
      factId: "fact-existing",
      mode: "source_added",
    });
    expect(operations).toEqual(
      expect.arrayContaining([
        { table: "canon_facts", method: "is", args: ["fact_key", null] },
      ])
    );
  });

  it("blocks approval until a linked entity suggestion resolves to an entity", async () => {
    const { client, operations } = createSupabaseMock([
      {
        data: {
          id: "suggestion-1",
          project_id: "project-1",
          chapter_id: "chapter-1",
          matched_entity_id: null,
          entity_suggestion_id: "entity-suggestion-1",
          fact_type: "ROLE",
          fact_key: null,
          value: "변방 마을의 영주다",
          evidence_text: "리엔은 변방 마을의 영주였다.",
          confidence: 0.86,
          status: "PENDING",
        },
        error: null,
      },
      { data: { matched_entity_id: null }, error: null },
    ]);

    const result = await approveFactSuggestion(
      client as never,
      "suggestion-1",
      "project-1"
    );

    expect(result.error).toContain("먼저 연결된 작품 기억 항목");
    expect(
      operations.some(
        (operation) => operation.table === "canon_facts" && operation.method === "insert"
      )
    ).toBe(false);
  });

  it("explicitly supersedes an approved conflicting fact after creating the replacement fact", async () => {
    const { client, operations } = createSupabaseMock([
      {
        data: pendingSupersedeSuggestion,
        error: null,
      },
      {
        data: approvedConflictFact,
        error: null,
      },
      { data: { id: "fact-new" }, error: null },
      { data: null, error: null },
      { data: null, error: null },
      { data: null, error: null },
    ]);

    const result = await supersedeFactSuggestion(
      client as never,
      "suggestion-1",
      "project-1",
      "fact-old"
    );

    expect(result).toEqual({
      error: null,
      factId: "fact-new",
      supersededFactId: "fact-old",
      mode: "superseded",
    });
    expect(operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "canon_facts", method: "insert" }),
        expect.objectContaining({ table: "canon_fact_sources", method: "insert" }),
        {
          table: "canon_facts",
          method: "update",
          args: [
            expect.objectContaining({
              status: "SUPERSEDED",
              superseded_by: "fact-new",
              valid_until_chapter_id: "chapter-2",
            }),
          ],
        },
        expect.objectContaining({ table: "fact_suggestions", method: "update" }),
      ])
    );
  });

  it.each([
    {
      name: "a fact from another project",
      conflict: { ...approvedConflictFact, project_id: "project-2" },
      expectedError: "대체할 기존 설정을 찾을 수 없습니다",
    },
    {
      name: "a fact for another entity",
      conflict: { ...approvedConflictFact, entity_id: "entity-2" },
      expectedError: "같은 항목과 설정 키의 기존 설정만 대체할 수 있습니다",
    },
    {
      name: "another fact type",
      conflict: { ...approvedConflictFact, fact_type: "ROLE" },
      expectedError: "같은 항목과 설정 키의 기존 설정만 대체할 수 있습니다",
    },
    {
      name: "another normalized fact key",
      conflict: { ...approvedConflictFact, fact_key: "age" },
      expectedError: "같은 항목과 설정 키의 기존 설정만 대체할 수 있습니다",
    },
    {
      name: "an already superseded fact",
      conflict: { ...approvedConflictFact, status: "SUPERSEDED" },
      expectedError: "승인된 기존 설정만 대체할 수 있습니다",
    },
    {
      name: "a fact with the same value",
      conflict: { ...approvedConflictFact, value: pendingSupersedeSuggestion.value },
      expectedError: "값이 같은 설정은 대체하지 않고 근거를 추가하세요",
    },
  ])("does not supersede $name", async ({ conflict, expectedError }) => {
    const { client, operations } = createSupabaseMock([
      { data: pendingSupersedeSuggestion, error: null },
      { data: conflict, error: null },
    ]);

    const result = await supersedeFactSuggestion(
      client as never,
      "suggestion-1",
      "project-1",
      "fact-old"
    );

    expect(result).toEqual({ error: expectedError });
    expect(
      operations.some(
        (operation) => operation.table === "canon_facts" && operation.method === "insert"
      )
    ).toBe(false);
    expect(
      operations.some(
        (operation) => operation.table === "canon_fact_sources" && operation.method === "insert"
      )
    ).toBe(false);
    expect(
      operations.some(
        (operation) => operation.table === "fact_suggestions" && operation.method === "update"
      )
    ).toBe(false);
  });
});
