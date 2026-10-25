-- Read-only structural checks; safe to run after an approved migration.
DO $$
DECLARE fn regprocedure := 'public.get_llm_usage_totals(uuid,uuid,boolean,boolean,boolean,boolean,timestamptz)'::regprocedure;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid = fn AND NOT prosecdef
    AND provolatile = 's' AND proconfig @> ARRAY['search_path=""']) THEN
    RAISE EXCEPTION 'usage aggregate must be STABLE SECURITY INVOKER with empty search_path';
  END IF;
  IF has_function_privilege('anon', fn, 'EXECUTE') OR has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon/service role must not execute the owner-bound aggregate';
  END IF;
  IF NOT has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated execute grant missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p, LATERAL aclexplode(p.proacl) a
    WHERE p.oid = fn AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC execute grant must be revoked';
  END IF;
END $$;
