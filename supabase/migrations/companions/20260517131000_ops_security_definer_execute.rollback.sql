-- Rollback for: 20260517131000_ops_security_definer_execute.sql

BEGIN;

GRANT EXECUTE ON FUNCTION public.detect_conflicts(uuid)
  TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_chat_messages(text, uuid, double precision, integer)
  TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_chapters_bm25(uuid, text, integer)
  TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_entities_bm25(uuid, text, integer)
  TO PUBLIC, anon, authenticated, service_role;

COMMIT;
