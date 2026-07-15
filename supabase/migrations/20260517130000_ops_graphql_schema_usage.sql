-- ============================================================================
-- P3 ops: restrict unused GraphQL schema from client roles
-- ============================================================================
-- The app uses PostgREST/supabase-js and does not call the GraphQL endpoint.
-- Keep table privileges intact for PostgREST, but remove direct access to the
-- `graphql` schema for anon/authenticated when pg_graphql is installed.
--
-- No data changes.
-- ============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'graphql'
  ) THEN
    REVOKE USAGE ON SCHEMA graphql FROM anon, authenticated;
  END IF;
END
$$;

COMMIT;
