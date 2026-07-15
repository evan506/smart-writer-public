-- Rollback for: 20260515130000_search_pg_trgm_korean.sql
--
-- Reverts the search migration:
--   1. Restores search_entities_bm25 / search_chapters_bm25 to their assumed
--      PRE-migration bodies (simple-tsvector + plainto_tsquery + ts_rank,
--      SECURITY DEFINER, project-ownership guard).
--   2. Drops the trigram GIN indexes added by the migration.
--   3. (Optional, commented) recreate the english FTS indexes — only relevant
--      if the optional "drop unused english FTS indexes" block from the
--      forward migration was ever run manually.
--
-- ⚠️ BEST-EFFORT RECONSTRUCTION. No SQL migration history existed in the repo
-- for these functions. The bodies below are reconstructed from
-- docs/db-audit-2026-05-15.md §9 (functions use to_tsvector('simple', …) +
-- plainto_tsquery('simple', …), SECURITY DEFINER, internal auth.uid()
-- project-ownership check from migration
-- add_auth_checks_to_security_definer_rpcs) and the documented RETURNS
-- contract. They reproduce the documented signature, return columns, ordering
-- intent (rank DESC) and ownership behavior, but the EXACT original text
-- (whitespace, the precise ts_rank weighting, NULL-handling, search_path
-- setting on the original) is NOT guaranteed. The return contract is
-- preserved either way.
--
-- ⚠️ pg_trgm caveat: this rollback intentionally does NOT
-- `DROP EXTENSION pg_trgm`. Dropping an extension is destructive (it would
-- drop the gin_trgm_ops opclass and anything depending on it) and pg_trgm is
-- harmless to leave installed. Drop it manually only if you are certain
-- nothing else uses trigram:
--   -- DROP EXTENSION IF EXISTS pg_trgm;
--
-- NOTE: Authored only. NOT applied to any remote DB here.

BEGIN;

SET LOCAL search_path TO public, extensions;

-- ---------------------------------------------------------------------------
-- 1. Restore search_entities_bm25 (assumed prior body)
-- ---------------------------------------------------------------------------
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
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.name,
    e.type,
    e.summary   AS description,
    e.metadata  AS settings,
    ts_rank(
      to_tsvector('simple',
        coalesce(e.name, '') || ' ' || coalesce(e.summary, '')),
      plainto_tsquery('simple', p_query)
    )::double precision AS rank
  FROM public.entities e
  WHERE e.project_id = p_project_id
    AND to_tsvector('simple',
          coalesce(e.name, '') || ' ' || coalesce(e.summary, ''))
        @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Restore search_chapters_bm25 (assumed prior body)
-- ---------------------------------------------------------------------------
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
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.chapter_num,
    c.title,
    c.content,
    c.summary,
    ts_rank(
      to_tsvector('simple',
        coalesce(c.title, '') || ' ' || coalesce(c.content, '')),
      plainto_tsquery('simple', p_query)
    )::double precision AS rank
  FROM public.chapters c
  WHERE c.project_id = p_project_id
    AND to_tsvector('simple',
          coalesce(c.title, '') || ' ' || coalesce(c.content, ''))
        @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Drop the trigram GIN indexes added by the forward migration
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_entities_name_trgm;
DROP INDEX IF EXISTS public.idx_entities_summary_trgm;
DROP INDEX IF EXISTS public.idx_chapters_title_trgm;
DROP INDEX IF EXISTS public.idx_chapters_content_trgm;

COMMIT;

-- ---------------------------------------------------------------------------
-- 4. OPTIONAL — recreate the english FTS indexes
-- ---------------------------------------------------------------------------
-- Only needed if the OPTIONAL "drop unused english FTS indexes" block at the
-- bottom of the forward migration was manually executed. These recreate them
-- in their original (effectively-unused) english regconfig form so the schema
-- is restorable. Run manually if required:
--
-- BEGIN;
-- CREATE INDEX IF NOT EXISTS idx_entities_name_fts
--   ON public.entities USING gin (to_tsvector('english', coalesce(name, '')));
-- CREATE INDEX IF NOT EXISTS idx_entities_summary_fts
--   ON public.entities USING gin (to_tsvector('english', coalesce(summary, '')));
-- CREATE INDEX IF NOT EXISTS idx_chapters_content_fts
--   ON public.chapters USING gin (to_tsvector('english', coalesce(content, '')));
-- CREATE INDEX IF NOT EXISTS idx_chapters_title_fts
--   ON public.chapters USING gin (to_tsvector('english', coalesce(title, '')));
-- CREATE INDEX IF NOT EXISTS idx_chunks_content_fts
--   ON public.chunks USING gin (to_tsvector('english', coalesce(content, '')));
-- COMMIT;
