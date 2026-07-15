-- Migration: search_pg_trgm_korean
-- Authored: 2026-05-15 (DB search track: wt-db-search)
--
-- Purpose:
--   Fix broken Korean keyword (BM25) search.
--
--   Root cause (live-DB verified):
--     * FTS GIN indexes were built with to_tsvector('english', …)
--       (idx_entities_name_fts, idx_entities_summary_fts,
--        idx_chapters_content_fts, idx_chapters_title_fts,
--        idx_chunks_content_fts).
--     * RPCs search_entities_bm25 / search_chapters_bm25 query with
--       to_tsvector('simple', …) + plainto_tsquery('simple', …).
--     * regconfig mismatch (english vs simple) -> the GIN indexes are never
--       used by the RPCs -> sequential scans.
--     * Neither 'english' (stemming, no Korean) nor 'simple' (whitespace /
--       punctuation split) performs Korean morphology, so Korean recall is
--       near-zero (e.g. query "카엘" does not match name "카엘을";
--       entity name "북쪽" exists, ILIKE finds 2 rows, but
--       search_entities_bm25 returns 0).
--
--   Fix:
--     1. Install pg_trgm (trigram) extension.
--     2. Add GIN trigram indexes on the searched text columns.
--     3. Rewrite search_entities_bm25 / search_chapters_bm25 to rank by
--        trigram similarity instead of tsvector. Trigram matching is
--        language-agnostic and matches partial Korean tokens
--        (e.g. "카엘" matches "카엘을", "북쪽" matches "북쪽 성벽").
--
-- Contract preservation (app + generated types depend on this — DO NOT change):
--   * search_entities_bm25(p_project_id uuid, p_query text, p_limit int = 10)
--       RETURNS TABLE(id uuid, name text, type text, description text,
--                     settings jsonb, rank double precision)
--       (description = entities.summary, settings = entities.metadata)
--   * search_chapters_bm25(p_project_id uuid, p_query text, p_limit int = 10)
--       RETURNS TABLE(id uuid, chapter_num integer, title text,
--                     content text, summary text, rank double precision)
--   * Both remain SECURITY DEFINER and keep the existing project-ownership
--     auth.uid() guard (only rows of projects owned by the caller are
--     returned; non-owners / unauthenticated callers get zero rows).
--   * Argument signature, RETURNS TABLE column names / order / types are
--     IDENTICAL. Only the ranking expression behind the existing `rank`
--     column changes: it is now a trigram similarity score in [0,1]
--     (double precision) instead of ts_rank. See the report for the
--     behavioral note on rag-search.service.ts reranking.
--
-- ASSUMED PRIOR FUNCTION BODIES (no SQL migration history existed in the repo;
-- reconstructed from docs/db-audit-2026-05-15.md §9 and the
-- add_auth_checks_to_security_definer_rpcs migration described there).
-- Best-effort reconstruction — see the .rollback.sql for the exact assumed
-- prior bodies that rollback restores:
--
--   search_entities_bm25:
--     IF NOT EXISTS (SELECT 1 FROM public.projects p
--                    WHERE p.id = p_project_id AND p.user_id = auth.uid())
--       THEN RETURN; END IF;
--     RETURN QUERY
--     SELECT e.id, e.name, e.type, e.summary AS description,
--            e.metadata AS settings,
--            ts_rank(
--              to_tsvector('simple', coalesce(e.name,'') || ' ' ||
--                                    coalesce(e.summary,'')),
--              plainto_tsquery('simple', p_query)
--            ) AS rank
--     FROM public.entities e
--     WHERE e.project_id = p_project_id
--       AND to_tsvector('simple', coalesce(e.name,'') || ' ' ||
--                                 coalesce(e.summary,''))
--           @@ plainto_tsquery('simple', p_query)
--     ORDER BY rank DESC
--     LIMIT p_limit;
--
--   search_chapters_bm25: analogous, over chapters(title, content),
--     returning (id, chapter_num, title, content, summary, rank).
--
-- NOTE: This file is authored only. It is NOT applied to any remote DB here.
--
-- Idempotency: CREATE EXTENSION IF NOT EXISTS / CREATE INDEX IF NOT EXISTS /
-- CREATE OR REPLACE FUNCTION — safe to re-run.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. pg_trgm extension
-- ---------------------------------------------------------------------------
-- Supabase convention: extensions live in the dedicated `extensions` schema
-- (pgcrypto / uuid-ossp are installed there per the audit). Install pg_trgm
-- there too rather than polluting `public`.
--
-- Operator/function resolution: the RPCs below SET search_path to
-- 'public, extensions' so the `%` operator and similarity()/word_similarity()
-- (which live in the extensions schema) resolve without schema-qualifying
-- every call. The trigram GIN indexes use the `gin_trgm_ops` opclass; an
-- opclass is resolved by name within the current search_path at CREATE INDEX
-- time, so `extensions` must be visible here as well. We schema-qualify the
-- opclass defensively where supported is not guaranteed, so instead we add
-- `extensions` to search_path for this migration session.
SET LOCAL search_path TO public, extensions;

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 2. Trigram GIN indexes
-- ---------------------------------------------------------------------------
-- These back the similarity() / `%` predicates in the rewritten RPCs.
-- coalesce(...,'') keeps NULL summary/title/content indexable and matches the
-- expression used in the function bodies so the planner can use the index.
--
-- gin_trgm_ops is provided by pg_trgm (in `extensions`, on search_path above).

CREATE INDEX IF NOT EXISTS idx_entities_name_trgm
  ON public.entities
  USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_entities_summary_trgm
  ON public.entities
  USING gin ((coalesce(summary, '')) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_chapters_title_trgm
  ON public.chapters
  USING gin ((coalesce(title, '')) extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_chapters_content_trgm
  ON public.chapters
  USING gin ((coalesce(content, '')) extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 3. Rewrite search_entities_bm25 — trigram similarity ranking
-- ---------------------------------------------------------------------------
-- IDENTICAL signature + RETURNS TABLE. Still SECURITY DEFINER. Keeps the
-- project-ownership guard (early RETURN -> empty set for non-owners /
-- unauthenticated). `rank` is now greatest(similarity(name), similarity(
-- summary)) in [0,1] (double precision) — the column name/type/order is
-- unchanged; only the ranking semantics change from ts_rank to trigram.
--
-- Matching strategy:
--   * `%` (similarity above pg_trgm.similarity_threshold) for the index-using
--     candidate filter on name OR summary.
--   * OR word_similarity(p_query, text) > 0.3 so a short query token matched
--     against a longer field (e.g. "카엘" vs "카엘을") still qualifies even
--     when whole-string similarity() is low.
--   * Explicit floor (rank > 0.1) to drop near-noise.
-- similarity_threshold is set per-call so the `%` operator (and the index)
-- behave deterministically regardless of session GUC.

CREATE OR REPLACE FUNCTION public.search_entities_bm25(
  p_project_id uuid,
  p_query text,
  p_limit integer DEFAULT 10
)
 RETURNS TABLE(
   id uuid,
   name text,
   type text,
   description text,
   settings jsonb,
   rank double precision
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Project-ownership guard: only the owner of p_project_id may search it.
  -- Non-owners / unauthenticated callers get zero rows.
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  -- Make the `%` operator deterministic for this call (index-driven).
  PERFORM set_config('pg_trgm.similarity_threshold', '0.1', true);

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.type,
    e.summary               AS description,
    e.metadata              AS settings,
    GREATEST(
      similarity(e.name, p_query),
      similarity(coalesce(e.summary, ''), p_query),
      word_similarity(p_query, e.name),
      word_similarity(p_query, coalesce(e.summary, ''))
    )::double precision     AS rank
  FROM public.entities e
  WHERE e.project_id = p_project_id
    AND (
      e.name % p_query
      OR coalesce(e.summary, '') % p_query
      OR word_similarity(p_query, e.name) > 0.3
      OR word_similarity(p_query, coalesce(e.summary, '')) > 0.3
    )
    AND GREATEST(
      similarity(e.name, p_query),
      similarity(coalesce(e.summary, ''), p_query),
      word_similarity(p_query, e.name),
      word_similarity(p_query, coalesce(e.summary, ''))
    ) > 0.1
  ORDER BY rank DESC, e.name ASC
  LIMIT p_limit;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Rewrite search_chapters_bm25 — trigram similarity ranking
-- ---------------------------------------------------------------------------
-- IDENTICAL signature + RETURNS TABLE
--   (id, chapter_num, title, content, summary, rank). Still SECURITY DEFINER,
-- keeps the project-ownership guard. `rank` is now trigram similarity in
-- [0,1] (double precision).

CREATE OR REPLACE FUNCTION public.search_chapters_bm25(
  p_project_id uuid,
  p_query text,
  p_limit integer DEFAULT 10
)
 RETURNS TABLE(
   id uuid,
   chapter_num integer,
   title text,
   content text,
   summary text,
   rank double precision
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  -- Project-ownership guard (same semantics as search_entities_bm25).
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  PERFORM set_config('pg_trgm.similarity_threshold', '0.1', true);

  RETURN QUERY
  SELECT
    c.id,
    c.chapter_num,
    c.title,
    c.content,
    c.summary,
    GREATEST(
      similarity(coalesce(c.title, ''), p_query),
      similarity(coalesce(c.content, ''), p_query),
      word_similarity(p_query, coalesce(c.title, '')),
      word_similarity(p_query, coalesce(c.content, ''))
    )::double precision     AS rank
  FROM public.chapters c
  WHERE c.project_id = p_project_id
    AND (
      coalesce(c.title, '') % p_query
      OR coalesce(c.content, '') % p_query
      OR word_similarity(p_query, coalesce(c.title, '')) > 0.3
      OR word_similarity(p_query, coalesce(c.content, '')) > 0.3
    )
    AND GREATEST(
      similarity(coalesce(c.title, ''), p_query),
      similarity(coalesce(c.content, ''), p_query),
      word_similarity(p_query, coalesce(c.title, '')),
      word_similarity(p_query, coalesce(c.content, ''))
    ) > 0.1
  ORDER BY rank DESC, c.chapter_num ASC
  LIMIT p_limit;
END;
$function$;

COMMIT;

-- ---------------------------------------------------------------------------
-- OPTIONAL (separate, NOT executed by default): drop unused english FTS
-- indexes.
-- ---------------------------------------------------------------------------
-- The old to_tsvector('english', …) GIN indexes are never used (regconfig
-- mismatch — the RPCs are the only FTS consumers and they no longer use
-- tsvector at all after this migration). Dropping them removes write
-- amplification on entities/chapters/chunks INSERT/UPDATE.
--
-- Left commented because the audit (§4) flags 25 "unused_index" entries that
-- include partly-empty tables, and because dropping these is a one-way change
-- that should be a deliberate, separately reviewed step. Rollback for the
-- block below is provided at the end of the .rollback.sql file.
--
-- To apply, run this block manually:
--
-- BEGIN;
-- DROP INDEX IF EXISTS public.idx_entities_name_fts;
-- DROP INDEX IF EXISTS public.idx_entities_summary_fts;
-- DROP INDEX IF EXISTS public.idx_chapters_content_fts;
-- DROP INDEX IF EXISTS public.idx_chapters_title_fts;
-- DROP INDEX IF EXISTS public.idx_chunks_content_fts;
-- COMMIT;
