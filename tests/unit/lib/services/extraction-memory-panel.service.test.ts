import { describe, expect, it, vi } from "vitest";
import { loadExtractionMemoryPanel } from "@/lib/services/extraction-memory/panel.service";

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
      if (table === "extraction_memory") return makeBuilder(opts.memoryRows);
      if (table === "projects")
        return makeBuilder(null, {
          excluded_terms: opts.excludedTerms,
          genre: opts.genre,
        });
      if (table === "genre_kits")
        return makeBuilder([{ rules: opts.genreRules, user_id: null }]);
      return makeBuilder(null);
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function memRow(p: Record<string, unknown>) {
  return {
    id: p.id ?? "id",
    project_id: "p1",
    kind: p.kind ?? "EXCLUDE_PATTERN",
    rule_key: p.rule_key ?? "k",
    rule_text: p.rule_text ?? "텍스트",
    source: p.source ?? "DISTILLED",
    status: p.status ?? "ACTIVE",
    evidence: null,
    created_at: "2026-06-14T00:00:00Z",
    updated_at: "2026-06-14T00:00:00Z",
  };
}

describe("loadExtractionMemoryPanel", () => {
  it("separates proposals, learned rules, and genre rules with override state", async () => {
    const supabase = mockSupabase({
      memoryRows: [
        memRow({ id: "p1r", rule_key: "learned", source: "MANUAL", status: "ACTIVE" }),
        memRow({ id: "prop", rule_key: "proposed", source: "DISTILLED", status: "DISABLED" }),
        memRow({ kind: "LAYER_OVERRIDE", rule_key: "uns", status: "DISABLED" }),
      ],
      excludedTerms: ["무명 병사"],
      genre: "헌터물",
      genreRules: [
        {
          extraction_conventions: {
            exclude_patterns: [
              { key: "uns", text: "불특정 제외" },
              { key: "crowd", text: "군중 제외" },
            ],
          },
        },
      ],
    });

    const panel = await loadExtractionMemoryPanel(supabase, "p1");

    expect(panel.projectRules.map((r) => r.key)).toEqual(["learned"]);
    expect(panel.proposals.map((r) => r.key)).toEqual(["proposed"]);
    expect(panel.excludedNames).toEqual(["무명 병사"]);

    const uns = panel.genreRules.find((r) => r.key === "uns");
    const crowd = panel.genreRules.find((r) => r.key === "crowd");
    expect(uns?.status).toBe("DISABLED"); // overridden
    expect(crowd?.status).toBe("ACTIVE");
  });
});
