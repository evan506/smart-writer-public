-- Rollback for: 20260517120000_ops_function_search_path.sql
--
-- Restores the target functions to their prior mutable search_path state.

BEGIN;

ALTER FUNCTION public.check_relationship(uuid, uuid)
  RESET search_path;

ALTER FUNCTION public.detect_conflicts(uuid)
  RESET search_path;

ALTER FUNCTION public.find_related_entities(uuid, integer)
  RESET search_path;

ALTER FUNCTION public.get_entity_context(uuid)
  RESET search_path;

ALTER FUNCTION public.match_chunks(text, double precision, integer, uuid, text[])
  RESET search_path;

ALTER FUNCTION public.update_updated_at_column()
  RESET search_path;

COMMIT;
