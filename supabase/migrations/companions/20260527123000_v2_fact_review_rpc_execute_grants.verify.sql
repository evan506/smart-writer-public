-- Verification for: 20260527123000_v2_fact_review_rpc_execute_grants.sql
--
-- Pure catalog inspection. No data required.

DO $$
DECLARE
  v_public_acl text;
BEGIN
  IF has_function_privilege(
    'anon',
    'public.list_pending_fact_review_items(uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FACT REVIEW RPC EXECUTE VERIFY FAILED: anon still has EXECUTE';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.list_pending_fact_review_items(uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FACT REVIEW RPC EXECUTE VERIFY FAILED: authenticated lacks EXECUTE';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.list_pending_fact_review_items(uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FACT REVIEW RPC EXECUTE VERIFY FAILED: service_role lacks EXECUTE';
  END IF;

  SELECT acl.grantee::text
    INTO v_public_acl
  FROM pg_proc p
  CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
  WHERE p.oid = 'public.list_pending_fact_review_items(uuid)'::regprocedure
    AND acl.grantee = 0
    AND acl.privilege_type = 'EXECUTE'
  LIMIT 1;

  IF v_public_acl IS NOT NULL THEN
    RAISE EXCEPTION 'FACT REVIEW RPC EXECUTE VERIFY FAILED: PUBLIC still has EXECUTE';
  END IF;

  RAISE NOTICE 'FACT REVIEW RPC EXECUTE VERIFY PASSED: anon/PUBLIC revoked and app roles preserved.';
END
$$;
