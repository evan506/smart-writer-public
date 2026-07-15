import { describe, expect, it } from "vitest";
import {
  emptyCodexData,
  getCodexDataForProject,
} from "@/lib/services/codex/read.service";
import { listApprovedCodexFactsByEntity } from "@/lib/services/canon-facts/read.service";

type QueryCall =
  | { method: "from"; table: string }
  | { method: "select"; table: string; columns: string; options?: unknown }
  | { method: "eq"; table: string; column: string; value: unknown }
  | { method: "in"; table: string; column: string; values: unknown[] }
  | { method: "neq"; table: string; column: string; value: unknown }
  | { method: "not"; table: string; column: string; operator: string; value: unknown }
  | { method: "or"; table: string; filters: string }
  | { method: "order"; table: string; column: string; options?: unknown };

type QueryResult = {
  data?: unknown;
  error?: { message: string } | null;
};

function createServiceClient(
  results: Record<string, QueryResult | QueryResult[]>
) {
  const calls: QueryCall[] = [];
  const resultIndexes = new Map<string, number>();

  function getResult(table: string, columns: string | null) {
    const key = `${table}:${columns ?? ""}`;
    const tableFallbackKey = `${table}:*`;
    const raw = results[key] ?? results[tableFallbackKey] ?? { data: null };
    const list = Array.isArray(raw) ? raw : [raw];
    const index = resultIndexes.get(key) ?? 0;
    resultIndexes.set(key, index + 1);
    return list[Math.min(index, list.length - 1)] ?? { data: null };
  }

  function createBuilder(table: string) {
    let selectedColumns: string | null = null;
    const builder = {
      select(columns: string, options?: unknown) {
        selectedColumns = columns;
        calls.push({ method: "select", table, columns, options });
        return builder;
      },
      eq(column: string, value: unknown) {
        calls.push({ method: "eq", table, column, value });
        return builder;
      },
      in(column: string, values: unknown[]) {
        calls.push({ method: "in", table, column, values });
        return builder;
      },
      neq(column: string, value: unknown) {
        calls.push({ method: "neq", table, column, value });
        return builder;
      },
      not(column: string, operator: string, value: unknown) {
        calls.push({ method: "not", table, column, operator, value });
        return builder;
      },
      or(filters: string) {
        calls.push({ method: "or", table, filters });
        return builder;
      },
      order(column: string, options?: unknown) {
        calls.push({ method: "order", table, column, options });
        return builder;
      },
      then(
        resolve: (value: {
          data: unknown;
          error: { message: string } | null;
        }) => unknown,
        reject?: (reason: unknown) => unknown
      ) {
        const result = getResult(table, selectedColumns);
        return Promise.resolve({
          data: result.data ?? null,
          error: result.error ?? null,
        }).then(resolve, reject);
      },
    };
    return builder;
  }

  const client = {
    from(table: string) {
      calls.push({ method: "from", table });
      return createBuilder(table);
    },
  };

  return { client, calls };
}

describe("codex read service", () => {
  it("returns an empty codex payload when the entity list query fails", async () => {
    const { client, calls } = createServiceClient({
      "entities:id, name, type, summary, aliases, metadata": {
        data: null,
        error: { message: "entities failed" },
      },
    });

    const result = await getCodexDataForProject(
      client as unknown as Parameters<typeof getCodexDataForProject>[0],
      "project-1"
    );

    expect(result).toEqual(emptyCodexData("entities failed"));
    expect(calls).toEqual([
      { method: "from", table: "entities" },
      {
        method: "select",
        table: "entities",
        columns: "id, name, type, summary, aliases, metadata",
        options: undefined,
      },
      { method: "eq", table: "entities", column: "project_id", value: "project-1" },
      { method: "order", table: "entities", column: "type", options: undefined },
      { method: "order", table: "entities", column: "name", options: undefined },
    ]);
  });

  it("matches pending suggestions by id or name and counts unmatched suggestions", async () => {
    const { client, calls } = createServiceClient({
      "entities:id, name, type, summary, aliases, metadata": {
        data: [
          {
            id: "entity-1",
            name: "리엔",
            type: "CHARACTER",
            summary: null,
            aliases: [],
            metadata: null,
          },
          {
            id: "entity-2",
            name: "검은 서고",
            type: "PLACE",
            summary: null,
            aliases: [],
            metadata: null,
          },
        ],
      },
      "entity_links:id, from_id, to_id, relation_type, direction, weight": {
        data: [],
      },
      "canon_facts:id, entity_id, fact_type, fact_key, value, status, confidence, established_chapter_id, approved_at": {
        data: [],
      },
      "entity_suggestions:id, matched_entity_id, chapter_id, name, type, suggested_action, context_snippet, updated_at": {
        data: [],
      },
      "chapters:id, chapter_num": {
        data: [{ id: "chapter-1", chapter_num: 7 }],
      },
      "foreshadows:id, description, planted_chapter, expected_reveal, status, entity_ids": {
        data: [],
      },
      "entity_suggestions:name, matched_entity_id": {
        data: [
          { name: "무시됨", matched_entity_id: "entity-1" },
          { name: "검은 서고", matched_entity_id: null },
          { name: "새 인물", matched_entity_id: null },
        ],
      },
      "entity_suggestions:id, name, type, summary, aliases, confidence, chapter_id": {
        data: [
          {
            id: "suggestion-1",
            name: "새 인물",
            type: "CHARACTER",
            summary: null,
            aliases: null,
            confidence: 0.87,
            chapter_id: "chapter-1",
          },
        ],
      },
    });

    const result = await getCodexDataForProject(
      client as unknown as Parameters<typeof getCodexDataForProject>[0],
      "project-1"
    );

    expect(result.error).toBeNull();
    expect(result.pendingSuggestions).toEqual({
      "entity-1": 1,
      "entity-2": 1,
    });
    expect(result.unmatchedSuggestionCount).toBe(1);
    expect(result.pendingEntities).toEqual([
      {
        id: "suggestion-1",
        name: "새 인물",
        type: "CHARACTER",
        summary: null,
        aliases: null,
        chapterNum: 7,
        confidence: 0.87,
      },
    ]);
    expect(calls).toContainEqual({
      method: "neq",
      table: "entity_suggestions",
      column: "type",
      value: "RELATION",
    });
    expect(calls).toContainEqual({
      method: "order",
      table: "entity_suggestions",
      column: "confidence",
      options: { ascending: false },
    });
  });

  it("groups approved entity facts and attaches sources to the matching fact", async () => {
    const { client, calls } = createServiceClient({
      "canon_facts:id, entity_id, fact_type, fact_key, value, status, confidence, established_chapter_id, approved_at": {
        data: [
          {
            id: "fact-1",
            entity_id: "entity-1",
            fact_type: "ATTRIBUTE",
            fact_key: "species",
            value: "하이엘프다",
            status: "APPROVED",
            confidence: 0.91,
            established_chapter_id: "chapter-1",
            approved_at: "2026-05-27T00:00:00.000Z",
          },
          {
            id: "fact-2",
            entity_id: "entity-2",
            fact_type: "ROLE",
            fact_key: "current_position",
            value: "검은 서고의 관리자다",
            status: "APPROVED",
            confidence: 0.84,
            established_chapter_id: "chapter-3",
            approved_at: "2026-05-27T01:00:00.000Z",
          },
        ],
      },
      "canon_fact_sources:id, fact_id, chapter_id, chunk_id, evidence_text, evidence_kind": {
        data: [
          {
            id: "source-1",
            fact_id: "fact-1",
            chapter_id: "chapter-2",
            chunk_id: "chunk-1",
            evidence_text: "리엔은 하이엘프라고 소개됐다.",
            evidence_kind: "DIRECT",
          },
          {
            id: "source-2",
            fact_id: "fact-2",
            chapter_id: "chapter-3",
            chunk_id: null,
            evidence_text: "검은 서고를 관리하는 인물로 언급됐다.",
            evidence_kind: "DIRECT",
          },
        ],
      },
      "chapters:id, chapter_num, title": {
        data: [
          { id: "chapter-1", chapter_num: 1, title: "첫 만남" },
          { id: "chapter-2", chapter_num: 2, title: "정체" },
          { id: "chapter-3", chapter_num: 3, title: null },
        ],
      },
    });

    const result = await listApprovedCodexFactsByEntity(
      client as unknown as Parameters<typeof listApprovedCodexFactsByEntity>[0],
      "project-1",
      ["entity-1", "entity-2"]
    );

    expect(result).toEqual({
      "entity-1": [
        {
          id: "fact-1",
          entityId: "entity-1",
          factType: "ATTRIBUTE",
          factKey: "species",
          value: "하이엘프다",
          status: "APPROVED",
          confidence: 0.91,
          establishedChapterId: "chapter-1",
          establishedChapterNum: 1,
          approvedAt: "2026-05-27T00:00:00.000Z",
          sources: [
            {
              id: "source-1",
              chapterId: "chapter-2",
              chapterNum: 2,
              chapterTitle: "정체",
              chunkId: "chunk-1",
              evidenceText: "리엔은 하이엘프라고 소개됐다.",
              evidenceKind: "DIRECT",
            },
          ],
        },
      ],
      "entity-2": [
        expect.objectContaining({
          id: "fact-2",
          entityId: "entity-2",
          establishedChapterNum: 3,
          sources: [
            expect.objectContaining({
              id: "source-2",
              chapterNum: 3,
              chapterTitle: null,
            }),
          ],
        }),
      ],
    });
    expect(calls).toContainEqual({
      method: "eq",
      table: "canon_facts",
      column: "status",
      value: "APPROVED",
    });
    expect(calls).toContainEqual({
      method: "in",
      table: "canon_fact_sources",
      column: "fact_id",
      values: ["fact-1", "fact-2"],
    });
    expect(calls).toContainEqual({
      method: "in",
      table: "chapters",
      column: "id",
      values: ["chapter-1", "chapter-3", "chapter-2"],
    });
  });

  it("returns entityFacts from the project codex read payload", async () => {
    const { client } = createServiceClient({
      "entities:id, name, type, summary, aliases, metadata": {
        data: [
          {
            id: "entity-1",
            name: "리엔",
            type: "CHARACTER",
            summary: null,
            aliases: [],
            metadata: null,
          },
        ],
      },
      "entity_links:id, from_id, to_id, relation_type, direction, weight": {
        data: [],
      },
      "entity_suggestions:id, matched_entity_id, chapter_id, name, type, suggested_action, context_snippet, updated_at": {
        data: [],
      },
      "chapters:id, chapter_num": {
        data: [{ id: "chapter-1", chapter_num: 1 }],
      },
      "canon_facts:id, entity_id, fact_type, fact_key, value, status, confidence, established_chapter_id, approved_at": {
        data: [
          {
            id: "fact-1",
            entity_id: "entity-1",
            fact_type: "ATTRIBUTE",
            fact_key: "species",
            value: "하이엘프다",
            status: "APPROVED",
            confidence: 0.91,
            established_chapter_id: "chapter-1",
            approved_at: null,
          },
        ],
      },
      "canon_fact_sources:id, fact_id, chapter_id, chunk_id, evidence_text, evidence_kind": {
        data: [],
      },
      "chapters:id, chapter_num, title": {
        data: [{ id: "chapter-1", chapter_num: 1, title: "첫 만남" }],
      },
      "foreshadows:id, description, planted_chapter, expected_reveal, status, entity_ids": {
        data: [],
      },
      "entity_suggestions:name, matched_entity_id": {
        data: [],
      },
      "entity_suggestions:id, name, type, summary, aliases, confidence, chapter_id": {
        data: [],
      },
    });

    const result = await getCodexDataForProject(
      client as unknown as Parameters<typeof getCodexDataForProject>[0],
      "project-1"
    );

    expect(result.error).toBeNull();
    expect(result.entityFacts["entity-1"]).toEqual([
      expect.objectContaining({
        id: "fact-1",
        value: "하이엘프다",
        establishedChapterNum: 1,
        sources: [],
      }),
    ]);
  });
});
