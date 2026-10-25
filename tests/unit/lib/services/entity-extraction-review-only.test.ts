import { describe, expect, it, vi } from "vitest";
import { runEntityExtractionOrchestration, type EntityExtractionOrchestrationDeps } from "@/lib/services/entity-extraction/orchestration";
import { insertRelationSuggestions } from "@/lib/services/entity-extraction/relation-writes";
import { normalizeEntityName, normalizedNameSet } from "@/lib/services/entity-extraction-utils";
import type { ClassifiedEntity, ExtractedRelation, KnownEntity } from "@/lib/services/prompt-templates";
import { createSupabaseMock } from "../../../helpers/supabase-mock";

vi.mock("@/lib/services/entity-extraction/db-boundaries", () => ({
  loadExistingLinks: async () => new Set(),
  loadExistingLinkDetails: async () => new Map(),
}));

const entity = (name: string, type = "CHARACTER"): ClassifiedEntity => ({
  name, type, importance: "high", confidence: 0.99, summary: "모델의 제안", context_snippet: `${name}이 등장했다.`,
});
const relation = (overrides: Partial<ExtractedRelation> = {}): ExtractedRelation => ({
  from_name: "아르넬", to_name: "아르넬의 종복", relation_type: "ENEMY", direction: "UNI", weight: 0.99,
  context_snippet: "아르넬은 아르넬의 종복을 공격했다.", ...overrides,
});
function setup(known: KnownEntity[] = [], candidates = [entity("검성"), entity("아르넬"), entity("아르넬의 종복")]) {
  const db = createSupabaseMock({
    entities: { data: known.map((value) => ({ ...value, aliases: value.aliases ?? [] })), error: null },
    entity_suggestions: [{ data: [], error: null }, { data: [{ id: "relation-suggestion" }], error: null }],
  });
  const deps: EntityExtractionOrchestrationDeps = {
    getKnownEntitiesData: vi.fn(async () => ({ names: known.flatMap((value) => [value.name, ...(value.aliases ?? [])]), typed: known })),
    getExistingSuggestionNames: async () => [],
    loadGenreRules: async () => ({ rulesText: "", excludedCharacterTerms: [] }),
    loadExistingRelationStrings: async () => [],
    loadProjectExcludedTerms: async () => [],
    loadExtractionGuidance: async () => "",
    splitForExtraction: () => ["원고 원문"],
    stage1ExtractNouns: async () => candidates.map((value) => value.name),
    filterCandidates: (values) => values,
    stage2Classify: vi.fn(async () => candidates),
    upsertEntitySuggestions: vi.fn(async (inserts) => inserts.length),
    loadEntitySuggestionRefs: async ({ names }) => new Map(names.map((name) => [name, { id: `suggestion-${name}`, matched_entity_id: null }])),
    insertFactSuggestions: vi.fn(async () => 0),
    stage3ExtractRelations: vi.fn(async () => [relation()]),
    mergeRelations: (values) => values,
    resolveRelationConflicts: (values) => values,
    getKnownEntityCanonicalNames: async () => new Set(known.map((value) => value.name)),
    insertRelationSuggestions: (projectId, chapterId, relations, validEntityNames, analysisEntities) => insertRelationSuggestions(db.client as never, {
      projectId, chapterId, relations, validEntityNames, analysisEntities, normalizeName: normalizeEntityName,
    }),
  };
  return { deps, db };
}
const input = { projectId: "project", chapterId: "chapter", content: "원고 원문" };

describe("extraction requires writer review", () => {
  it("keeps .99 entity and relation candidates pending without merging prefix names or writing canon", async () => {
    const { deps, db } = setup();
    const result = await runEntityExtractionOrchestration(input, deps);
    expect(result).toEqual({ suggestionCount: 3, relationSuggestionCount: 1, factSuggestionCount: 0 });
    expect(deps.upsertEntitySuggestions).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: "검성", confidence: 0.99, status: "PENDING" }),
      expect.objectContaining({ name: "아르넬", status: "PENDING" }),
      expect.objectContaining({ name: "아르넬의 종복", status: "PENDING" }),
    ]));
    expect(deps.stage3ExtractRelations).toHaveBeenCalledWith([
      { name: "검성", type: "CHARACTER" }, { name: "아르넬", type: "CHARACTER" }, { name: "아르넬의 종복", type: "CHARACTER" },
    ], input.content, []);
    expect(db.calls.find((call) => call.operation === "upsert")?.payload).toEqual([
      expect.objectContaining({ type: "RELATION", status: "PENDING", confidence: 0.99 }),
    ]);
    expect(db.calls.filter((call) => ["entities", "entity_links"].includes(call.table) && call.operation !== "select")).toEqual([]);
    expect(deps.getKnownEntitiesData).toHaveBeenCalledTimes(1);
  });

  it("retains saved identities and approved types over pending suggestions", async () => {
    const known = [{ id: "saved", name: "하이 엘프", type: "CONCEPT", aliases: ["엘프족"] }];
    const { deps } = setup(known, [entity("하이엘프"), entity("엘프족"), entity("신인물")]);
    await runEntityExtractionOrchestration(input, deps);
    expect(deps.stage3ExtractRelations).toHaveBeenCalledWith([
      known[0], { name: "신인물", type: "CHARACTER" },
    ], input.content, []);
    expect(known).toEqual([{ id: "saved", name: "하이 엘프", type: "CONCEPT", aliases: ["엘프족"] }]);
  });

  it("stops before any candidate writes when classification fails", async () => {
    const { deps, db } = setup();
    const failure = new Error("Stage2 parse failed");
    vi.mocked(deps.stage2Classify).mockRejectedValue(failure);
    await expect(runEntityExtractionOrchestration(input, deps)).rejects.toBe(failure);
    expect(deps.upsertEntitySuggestions).not.toHaveBeenCalled();
    expect(deps.insertFactSuggestions).not.toHaveBeenCalled();
    expect(deps.stage3ExtractRelations).not.toHaveBeenCalled();
    expect(db.calls).toEqual([]);
  });

  it("retains pending character evidence and cross-type validation without canon IDs", async () => {
    const { client, calls } = createSupabaseMock({ entities: { data: [], error: null } });
    const result = await insertRelationSuggestions(client as never, {
      projectId: "project", chapterId: "chapter", normalizeName: normalizeEntityName,
      validEntityNames: normalizedNameSet(["아르넬", "아르넬의 종복", "탑"]),
      analysisEntities: [{ name: "아르넬", type: "CHARACTER" }, { name: "아르넬의 종복", type: "CHARACTER" }, { name: "탑", type: "PLACE" }],
      relations: [relation({ context_snippet: "아르넬과 아르넬의 종복이 같은 방에 있었다." }), relation({ to_name: "탑", relation_type: "ALLY" })],
    });
    expect(result).toBe(0);
    expect(calls.every((call) => call.operation === "select")).toBe(true);
  });

  it("requires review even for formerly auto-registerable links with saved endpoints", async () => {
    const { client, calls } = createSupabaseMock({
      entities: { data: [{ id: "a", name: "아르넬", type: "CHARACTER", aliases: [] }, { id: "b", name: "마왕군", type: "ORGANIZATION", aliases: [] }], error: null },
      entity_suggestions: [{ data: [], error: null }, { data: [{ id: "pending" }], error: null }],
    });
    await expect(insertRelationSuggestions(client as never, {
      projectId: "project", chapterId: "chapter", normalizeName: normalizeEntityName,
      validEntityNames: normalizedNameSet(["아르넬", "마왕군"]),
      relations: [relation({ to_name: "마왕군", relation_type: "MEMBER_OF" })],
    })).resolves.toBe(1);
    expect(calls.filter((call) => call.operation !== "select")).toEqual([
      expect.objectContaining({ table: "entity_suggestions", operation: "upsert", payload: [expect.objectContaining({ status: "PENDING" })] }),
    ]);
  });
});
