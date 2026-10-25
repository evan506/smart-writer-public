-- Restore the app caller BEFORE removing this function; old caller retains its
-- preexisting truncation/fail-open limits. Never apply without operation approval.
DROP FUNCTION IF EXISTS public.get_llm_usage_totals(uuid, uuid, boolean, boolean, boolean, boolean, timestamptz);
