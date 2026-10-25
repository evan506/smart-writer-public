import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SearchService } from "@/lib/services/search.service";

type ChapterArgs = Database["public"]["Functions"]["search_chapters_bm25"]["Args"];
const migration = readFileSync(resolve("supabase/migrations/20261017233850_qa_chapter_word_similarity_threshold.sql"), "utf8");
const previous = readFileSync(resolve("supabase/migrations/20260515140000_search_pg_trgm_korean.sql"), "utf8");
function setup(data: unknown = null, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const service = new SearchService({ rpc } as unknown as SupabaseClient<Database>);
  return { rpc, service };
}

describe("SearchService chapter word-similarity option", () => {
  it("keeps ordinary calls at three RPC arguments and the existing default limit", async () => {
    const { rpc, service } = setup();
    expect(await service.searchChaptersBm25("project", "query")).toEqual([]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("search_chapters_bm25", {
      p_project_id: "project", p_query: "query", p_limit: 10,
    });
  });

  it.each([undefined, {}, { wordSimilarityThreshold: undefined }])("omits the new RPC key for unset options %j", async options => {
    const { rpc, service } = setup();
    await service.searchChaptersBm25("project", "query", 4, options);
    expect(rpc.mock.calls[0][1]).toEqual({ p_project_id: "project", p_query: "query", p_limit: 4 });
    expect(Object.hasOwn(rpc.mock.calls[0][1], "p_word_threshold")).toBe(false);
  });

  it.each([0.25, 0.3] as const)("forwards explicitly selected threshold %s with unchanged query and limit", async threshold => {
    const rows = [{ id: "chapter", chapter_num: 15, title: "title", content: "text", summary: "summary", rank: 0.28 }];
    const { rpc, service } = setup(rows);
    expect(await service.searchChaptersBm25("project", "unchanged query", 4, { wordSimilarityThreshold: threshold })).toBe(rows);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("search_chapters_bm25", {
      p_project_id: "project", p_query: "unchanged query", p_limit: 4, p_word_threshold: threshold,
    });
  });

  it.each([null, 0, 0.2, 0.25001, 1, Number.NaN, Number.POSITIVE_INFINITY, "0.25"])("rejects unsupported runtime threshold %s before RPC", async threshold => {
    const { rpc, service } = setup();
    await expect(service.searchChaptersBm25("project", "query", 4, { wordSimilarityThreshold: threshold as 0.25 })).rejects.toThrow("Unsupported");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves database error propagation", async () => {
    const error = { code: "42501", message: "denied" };
    const { service } = setup(null, error);
    await expect(service.searchChaptersBm25("project", "query", 4, { wordSimilarityThreshold: 0.25 })).rejects.toBe(error);
  });

  it("keeps the generated RPC argument optional and compatible with old callers", () => {
    const legacy: ChapterArgs = { p_project_id: "project", p_query: "query", p_limit: 4 };
    const diagnostic: ChapterArgs = { ...legacy, p_word_threshold: 0.25 };
    expectTypeOf<ChapterArgs["p_word_threshold"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<NonNullable<Parameters<SearchService["searchChaptersBm25"]>[3]>["wordSimilarityThreshold"]>().toEqualTypeOf<0.25 | 0.3 | undefined>();
    expect(diagnostic.p_word_threshold).toBe(0.25);
  });
});

describe("chapter threshold migration static contract (not DB execution)", () => {
  it("replaces the three-argument signature with one default-compatible four-argument RPC", () => {
    expect(migration).toContain("DROP FUNCTION public.search_chapters_bm25(uuid, text, integer);");
    expect(migration.match(/CREATE (?:OR REPLACE )?FUNCTION public\.search_chapters_bm25\(/g)).toHaveLength(1);
    expect(migration).toMatch(/p_limit integer DEFAULT 10,\s+p_word_threshold double precision DEFAULT 0\.3/);
    expect(migration.indexOf("DROP FUNCTION")).toBeLessThan(migration.indexOf("CREATE FUNCTION"));
    expect(migration).not.toMatch(/\bCASCADE\b/);
  });

  it("changes only the two word-similarity predicates in the existing search query", () => {
    const query = (sql: string) => sql.slice(sql.indexOf("  RETURN QUERY", sql.indexOf("FUNCTION public.search_chapters_bm25")), sql.indexOf("END;", sql.indexOf("FUNCTION public.search_chapters_bm25")));
    expect(query(migration)).toBe(query(previous).replaceAll("> 0.3", "> p_word_threshold"));
    expect(migration.match(/word_similarity\([^\n]+> p_word_threshold/g)).toHaveLength(2);
    expect(migration).toContain("PERFORM set_config('pg_trgm.similarity_threshold', '0.1', true);");
  });

  it("preserves SECURITY DEFINER search_path, project ownership guard and restricted ACLs", () => {
    expect(migration).toContain("SECURITY DEFINER\n SET search_path TO 'public', 'extensions'");
    const guard = "IF NOT EXISTS (\n    SELECT 1\n    FROM public.projects p\n    WHERE p.id = p_project_id\n      AND p.user_id = auth.uid()\n  ) THEN\n    RETURN;\n  END IF;";
    expect(migration).toContain(guard);
    const signature = "public.search_chapters_bm25(uuid, text, integer, double precision)";
    expect(migration).toContain(`REVOKE EXECUTE ON FUNCTION ${signature}\n  FROM PUBLIC, anon;`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}\n  TO authenticated, service_role;`);
    expect(migration).toMatch(/BEGIN;[\s\S]*COMMIT;/);
  });

  it("validates the SQL parameter allowlist including NULL", () => {
    expect(migration).toContain("IF p_word_threshold IS NULL OR p_word_threshold NOT IN (0.25, 0.3) THEN");
    expect(migration).toContain("USING ERRCODE = '22023';");
  });
});
