-- ============================================================================
-- P3 ops: pin search_path for mutable public functions
-- ============================================================================
-- Supabase security advisor reports `function_search_path_mutable` when a
-- function can resolve unqualified names through the caller/session search_path.
-- This migration keeps function bodies and signatures unchanged, and only pins
-- their runtime search_path.
--
-- Scope:
--   * Functions still missing proconfig search_path after prior migrations.
--   * Existing search_entities_bm25/search_chapters_bm25/match_chat_messages
--     already have explicit search_path and are intentionally untouched.
--
-- No data changes.
-- ============================================================================

BEGIN;

ALTER FUNCTION public.check_relationship(uuid, uuid)
  SET search_path TO public;

ALTER FUNCTION public.detect_conflicts(uuid)
  SET search_path TO public;

ALTER FUNCTION public.find_related_entities(uuid, integer)
  SET search_path TO public;

ALTER FUNCTION public.get_entity_context(uuid)
  SET search_path TO public;

ALTER FUNCTION public.match_chunks(text, double precision, integer, uuid, text[])
  SET search_path TO public;

ALTER FUNCTION public.update_updated_at_column()
  SET search_path TO public;

COMMIT;
