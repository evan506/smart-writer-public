-- Verification for: 20260517131000_ops_security_definer_execute.sql
--
-- Pure catalog inspection. No data required.

DO $$
DECLARE
  v_sig text;
  v_anon text;
  v_authenticated_missing text;
  v_service_role_missing text;
  v_public_acl text;
BEGIN
  WITH target(fn_oid, sig) AS (
    VALUES
      ('public.detect_conflicts(uuid)'::regprocedure, 'public.detect_conflicts(uuid)'),
      ('public.match_chat_messages(text,uuid,double precision,integer)'::regprocedure, 'public.match_chat_messages(text,uuid,double precision,integer)'),
      ('public.search_chapters_bm25(uuid,text,integer)'::regprocedure, 'public.search_chapters_bm25(uuid,text,integer)'),
      ('public.search_entities_bm25(uuid,text,integer)'::regprocedure, 'public.search_entities_bm25(uuid,text,integer)')
  )
  SELECT string_agg(sig, ', ')
    INTO v_anon
  FROM target
  WHERE has_function_privilege('anon', fn_oid, 'EXECUTE');

  IF v_anon IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER EXECUTE VERIFY FAILED: anon still has EXECUTE on %', v_anon;
  END IF;

  WITH target(fn_oid, sig) AS (
    VALUES
      ('public.detect_conflicts(uuid)'::regprocedure, 'public.detect_conflicts(uuid)'),
      ('public.match_chat_messages(text,uuid,double precision,integer)'::regprocedure, 'public.match_chat_messages(text,uuid,double precision,integer)'),
      ('public.search_chapters_bm25(uuid,text,integer)'::regprocedure, 'public.search_chapters_bm25(uuid,text,integer)'),
      ('public.search_entities_bm25(uuid,text,integer)'::regprocedure, 'public.search_entities_bm25(uuid,text,integer)')
  )
  SELECT string_agg(sig, ', ')
    INTO v_authenticated_missing
  FROM target
  WHERE NOT has_function_privilege('authenticated', fn_oid, 'EXECUTE');

  IF v_authenticated_missing IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER EXECUTE VERIFY FAILED: authenticated lacks EXECUTE on %', v_authenticated_missing;
  END IF;

  WITH target(fn_oid, sig) AS (
    VALUES
      ('public.detect_conflicts(uuid)'::regprocedure, 'public.detect_conflicts(uuid)'),
      ('public.match_chat_messages(text,uuid,double precision,integer)'::regprocedure, 'public.match_chat_messages(text,uuid,double precision,integer)'),
      ('public.search_chapters_bm25(uuid,text,integer)'::regprocedure, 'public.search_chapters_bm25(uuid,text,integer)'),
      ('public.search_entities_bm25(uuid,text,integer)'::regprocedure, 'public.search_entities_bm25(uuid,text,integer)')
  )
  SELECT string_agg(sig, ', ')
    INTO v_service_role_missing
  FROM target
  WHERE NOT has_function_privilege('service_role', fn_oid, 'EXECUTE');

  IF v_service_role_missing IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY DEFINER EXECUTE VERIFY FAILED: service_role lacks EXECUTE on %', v_service_role_missing;
  END IF;

  FOR v_sig, v_public_acl IN
    SELECT target.sig, acl.grantee::text
    FROM (
      VALUES
        ('public.detect_conflicts(uuid)'::regprocedure, 'public.detect_conflicts(uuid)'),
        ('public.match_chat_messages(text,uuid,double precision,integer)'::regprocedure, 'public.match_chat_messages(text,uuid,double precision,integer)'),
        ('public.search_chapters_bm25(uuid,text,integer)'::regprocedure, 'public.search_chapters_bm25(uuid,text,integer)'),
        ('public.search_entities_bm25(uuid,text,integer)'::regprocedure, 'public.search_entities_bm25(uuid,text,integer)')
    ) AS target(fn_oid, sig)
    JOIN pg_proc p ON p.oid = target.fn_oid
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
    WHERE acl.grantee = 0
      AND acl.privilege_type = 'EXECUTE'
  LOOP
    RAISE EXCEPTION 'SECURITY DEFINER EXECUTE VERIFY FAILED: PUBLIC still has EXECUTE on %', v_sig;
  END LOOP;

  RAISE NOTICE 'SECURITY DEFINER EXECUTE VERIFY PASSED: anon/PUBLIC revoked and app roles preserved.';
END
$$;
