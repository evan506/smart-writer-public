-- Rollback for: 20260517130000_ops_graphql_schema_usage.sql

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'graphql'
  ) THEN
    GRANT USAGE ON SCHEMA graphql TO anon, authenticated;
  END IF;
END
$$;

COMMIT;
