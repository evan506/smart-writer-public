-- Catalog-only verification for atomic Codex entity mutations.

DO $$
DECLARE
  v_proc regprocedure;
  v_result text;
  v_config text[];
  v_security_definer boolean;
  v_table text;
BEGIN
  FOREACH v_proc IN ARRAY ARRAY[
    'public.merge_codex_entity_as_alias(uuid,uuid,uuid)'::regprocedure,
    'public.delete_codex_entity(uuid,uuid,boolean)'::regprocedure
  ]
  LOOP
    SELECT proconfig, prosecdef
    INTO v_config, v_security_definer
    FROM pg_proc
    WHERE oid = v_proc;

    IF v_security_definer THEN
      RAISE EXCEPTION 'ATOMIC ENTITY VERIFY FAILED: % must be SECURITY INVOKER', v_proc;
    END IF;
    IF NOT ('search_path=public' = ANY(v_config)) THEN
      RAISE EXCEPTION 'ATOMIC ENTITY VERIFY FAILED: % search_path is not public', v_proc;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_proc p,
        aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = v_proc
        AND acl.grantee = 0
        AND acl.privilege_type = 'EXECUTE'
    ) OR has_function_privilege('anon', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'ATOMIC ENTITY VERIFY FAILED: % is executable by PUBLIC/anon', v_proc;
    END IF;
    IF NOT has_function_privilege('authenticated', v_proc, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_proc, 'EXECUTE') THEN
      RAISE EXCEPTION 'ATOMIC ENTITY VERIFY FAILED: % missing authenticated/service_role grant', v_proc;
    END IF;
  END LOOP;

  SELECT pg_get_function_result(
    'public.merge_codex_entity_as_alias(uuid,uuid,uuid)'::regprocedure
  ) INTO v_result;
  IF v_result NOT LIKE '%source_name text%target_name text%target_summary text%target_aliases jsonb%' THEN
    RAISE EXCEPTION 'ATOMIC ENTITY VERIFY FAILED: merge return contract changed';
  END IF;

  FOREACH v_table IN ARRAY ARRAY[
    'entities', 'entity_links', 'entity_suggestions', 'mentions', 'foreshadows',
    'canon_facts', 'canon_fact_sources', 'fact_suggestions', 'personas', 'projects'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid = format('public.%I', v_table)::regclass
        AND relrowsecurity
    ) THEN
      RAISE EXCEPTION 'ATOMIC ENTITY VERIFY FAILED: RLS disabled on %', v_table;
    END IF;
  END LOOP;

  RAISE NOTICE 'ATOMIC ENTITY VERIFY PASSED';
END
$$;
