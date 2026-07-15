-- ============================================================================
-- P3 ops: remove anonymous execute from SECURITY DEFINER RPCs
-- ============================================================================
-- The target functions have explicit auth.uid() ownership gates, but Supabase
-- advisor still reports anonymous execution on SECURITY DEFINER functions.
-- Revoke EXECUTE from PUBLIC and anon while preserving authenticated/service
-- role access used by normal app paths and operations.
--
-- No data changes.
-- ============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.detect_conflicts(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.match_chat_messages(text, uuid, double precision, integer)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_chapters_bm25(uuid, text, integer)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.search_entities_bm25(uuid, text, integer)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.detect_conflicts(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_chat_messages(text, uuid, double precision, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_chapters_bm25(uuid, text, integer)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_entities_bm25(uuid, text, integer)
  TO authenticated, service_role;

COMMIT;
