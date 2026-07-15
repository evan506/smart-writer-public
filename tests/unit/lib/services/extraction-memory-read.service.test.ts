import { describe, expect, it, vi } from "vitest";
import {
  assembleExtractionMemory,
  disabledGenreKeysFromRows,
  genreConventionsToRules,
  parseGenreConventions,
  projectRowsToRules,
} from "@/lib/services/extraction-memory/read.service";

type Row = Parameters<typeof projectRowsToRules>[0][number];

function row(partial: Partial<Row> & { kind: string; rule_key: string }): Row {
  return {
    id: partial.id ?? `id-${partial.rule_key}`,
    project_id: partial.project_id ?? "proj-1",
    kind: partial.kind,
    rule_key: partial.rule_key,
    rule_text: partial.rule_text ?? `text-${partial.rule_key}`,
    source: partial.source ?? "DISTILLED",
    status: partial.status ?? "ACTIVE",
    evidence: partial.evidence ?? null,
    created_at: partial.created_at ?? "2026-06-14T00:00:00Z",
    updated_at: partial.updated_at ?? "2026-06-14T00:00:00Z",
  } as Row;
}

describe("parseGenreConventions", () => {
  it("extracts conventions from the genre kit rules array", () => {
    const rules = [
      { rule: "기존 규칙", category: "플롯" },
      { excluded_character_terms: [] },
      {
        extraction_conventions: {
          exclude_patterns: [{ key: "uns", text: "불특정 인물 제외" }],
          type_conventions: [{ key: "gate", text: "게이트는 장소" }],
        },
      },
    ];
    const conv = parseGenreConventions(rules);
    expect(conv.excludePatterns).toEqual([{ key: "uns", text: "불특정 인물 제외" }]);
    expect(conv.typeConventions).toEqual([{ key: "gate", text: "게이트는 장소" }]);
  });

  it("returns empty conventions when none present or shape is wrong", () => {
    expect(parseGenreConventions(null)).toEqual({
      excludePatterns: [],
      typeConventions: [],
    });
    expect(parseGenreConventions([{ rule: "x", category: "y" }])).toEqual({
      excludePatterns: [],
      typeConventions: [],
    });
  });

  it("skips malformed convention entries", () => {
    const conv = parseGenreConventions([
      {
        extraction_conventions: {
          exclude_patterns: [
            { key: "ok", text: "valid" },
            { key: "", text: "no key" },
            { key: "no-text" },
            "not an object",
          ],
        },
      },
    ]);
    expect(conv.excludePatterns).toEqual([{ key: "ok", text: "valid" }]);
    expect(conv.typeConventions).toEqual([]);
  });
});

describe("genreConventionsToRules", () => {
  it("maps conventions to genre-layer curated rules", () => {
    const rules = genreConventionsToRules({
      excludePatterns: [{ key: "uns", text: "불특정 제외" }],
      typeConventions: [{ key: "gate", text: "게이트는 장소" }],
    });
    expect(rules).toEqual([
      {
        key: "uns",
        text: "불특정 제외",
        kind: "EXCLUDE_PATTERN",
        layer: "genre",
        source: "CURATED",
      },
      {
        key: "gate",
        text: "게이트는 장소",
        kind: "TYPE_CONVENTION",
        layer: "genre",
        source: "CURATED",
      },
    ]);
  });
});

describe("projectRowsToRules", () => {
  it("keeps only ACTIVE pattern/type rows and maps source", () => {
    const rules = projectRowsToRules([
      row({ kind: "EXCLUDE_PATTERN", rule_key: "a", source: "MANUAL" }),
      row({ kind: "TYPE_CONVENTION", rule_key: "b" }),
      row({ kind: "EXCLUDE_PATTERN", rule_key: "c", status: "DISABLED" }),
      row({ kind: "LAYER_OVERRIDE", rule_key: "g1", status: "DISABLED" }),
    ]);
    expect(rules.map((r) => r.key)).toEqual(["a", "b"]);
    expect(rules[0]).toMatchObject({ source: "MANUAL", layer: "project" });
    expect(rules[1]).toMatchObject({ source: "DISTILLED" });
  });
});

describe("disabledGenreKeysFromRows", () => {
  it("collects rule keys from disabled LAYER_OVERRIDE rows only", () => {
    const keys = disabledGenreKeysFromRows([
      row({ kind: "LAYER_OVERRIDE", rule_key: "g1", status: "DISABLED" }),
      row({ kind: "LAYER_OVERRIDE", rule_key: "g2", status: "ACTIVE" }),
      row({ kind: "EXCLUDE_PATTERN", rule_key: "p1" }),
    ]);
    expect(Array.from(keys)).toEqual(["g1"]);
  });
});

// ---------------------------------------------------------------------------
// Orchestrator with a mocked Supabase client
// ---------------------------------------------------------------------------

function makeBuilder(thenData: unknown, singleData?: unknown) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  Object.assign(builder, {
    select: vi.fn(chain),
    eq: vi.fn(chain),
    order: vi.fn(chain),
    limit: vi.fn(chain),
    single: vi.fn(() => Promise.resolve({ data: singleData, error: null })),
    then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
      Promise.resolve(resolve({ data: thenData, error: null })),
  });
  return builder;
}

function mockSupabase(opts: {
  memoryRows: unknown[];
  excludedTerms: unknown;
  genre: string | null;
  genreRules: unknown;
}) {
  return {
    from: vi.fn((table: string) => {
      if (table === "extraction_memory") {
        return makeBuilder(opts.memoryRows);
      }
      if (table === "projects") {
        return makeBuilder(null, {
          excluded_terms: opts.excludedTerms,
          genre: opts.genre,
        });
      }
      if (table === "genre_kits") {
        return makeBuilder([{ rules: opts.genreRules, user_id: null }]);
      }
      return makeBuilder(null);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("assembleExtractionMemory", () => {
  it("merges project rules, genre baseline, overrides, and excluded names", async () => {
    const supabase = mockSupabase({
      memoryRows: [
        row({ kind: "EXCLUDE_PATTERN", rule_key: "flashback", rule_text: "회상 중복 제외" }),
        row({ kind: "LAYER_OVERRIDE", rule_key: "uns", status: "DISABLED" }),
      ],
      excludedTerms: ["지나가던 상인"],
      genre: "헌터물",
      genreRules: [
        {
          extraction_conventions: {
            exclude_patterns: [
              { key: "uns", text: "불특정 인물 제외" },
              { key: "crowd", text: "군중 제외" },
            ],
            type_conventions: [{ key: "gate", text: "게이트는 장소" }],
          },
        },
      ],
    });

    const memory = await assembleExtractionMemory(supabase, "proj-1");

    const keys = memory.rules.map((r) => r.key);
    // "uns" genre rule is disabled by the LAYER_OVERRIDE row.
    expect(keys).not.toContain("uns");
    expect(keys).toContain("flashback");
    expect(keys).toContain("crowd");
    expect(keys).toContain("gate");
    expect(memory.excludeNames).toEqual(["지나가던 상인"]);
    expect(memory.promptBlock).toContain("[추출 학습 메모리]");
    expect(memory.promptBlock).toContain("지나가던 상인");
    expect(memory.appliedSummary.byLayer.project).toBe(1);
    expect(memory.appliedSummary.byLayer.genre).toBe(2);
  });

  it("returns an empty prompt block when there is no memory", async () => {
    const supabase = mockSupabase({
      memoryRows: [],
      excludedTerms: null,
      genre: null,
      genreRules: null,
    });
    const memory = await assembleExtractionMemory(supabase, "proj-1");
    expect(memory.rules).toEqual([]);
    expect(memory.excludeNames).toEqual([]);
    expect(memory.promptBlock).toBe("");
    expect(memory.appliedSummary.totalRules).toBe(0);
  });
});
