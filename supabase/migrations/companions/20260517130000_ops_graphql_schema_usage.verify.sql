-- Verification for: 20260517130000_ops_graphql_schema_usage.sql
--
-- Pure catalog inspection. No data required. The disposable replay database
-- does not install pg_graphql, so absence of schema `graphql` is acceptable.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'graphql'
  ) THEN
    IF has_schema_privilege('anon', 'graphql', 'USAGE') THEN
      RAISE EXCEPTION 'GRAPHQL SCHEMA VERIFY FAILED: anon still has USAGE on schema graphql.';
    END IF;

    IF has_schema_privilege('authenticated', 'graphql', 'USAGE') THEN
      RAISE EXCEPTION 'GRAPHQL SCHEMA VERIFY FAILED: authenticated still has USAGE on schema graphql.';
    END IF;
  END IF;

  RAISE NOTICE 'GRAPHQL SCHEMA VERIFY PASSED: schema absent or client USAGE revoked.';
END
$$;
