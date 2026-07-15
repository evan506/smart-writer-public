-- Verification for: 20260522170000_llm_usage_logs.sql

DO $$
DECLARE
  missing_columns text[];
  has_insert_policy boolean;
  has_select_policy boolean;
  anon_can_cleanup boolean;
  authenticated_can_cleanup boolean;
  service_role_can_cleanup boolean;
BEGIN
  SELECT array_agg(column_name ORDER BY column_name)
  INTO missing_columns
  FROM (
    VALUES
      ('id'),
      ('project_id'),
      ('user_id'),
      ('feature'),
      ('provider'),
      ('model'),
      ('provider_response_id'),
      ('prompt_template_key'),
      ('prompt_template_version'),
      ('status'),
      ('prompt_tokens'),
      ('completion_tokens'),
      ('total_tokens'),
      ('cached_prompt_tokens'),
      ('reasoning_tokens'),
      ('cost_usd'),
      ('latency_ms'),
      ('retry_count'),
      ('timed_out'),
      ('error_type'),
      ('raw_usage'),
      ('created_at')
  ) AS expected(column_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'llm_usage_logs'
      AND c.column_name = expected.column_name
  );

  IF missing_columns IS NOT NULL THEN
    RAISE EXCEPTION 'llm_usage_logs missing columns: %', missing_columns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'llm_usage_logs_project_id_fkey'
  ) THEN
    RAISE EXCEPTION 'llm_usage_logs_project_id_fkey missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'llm_usage_logs_feature_check'
  ) THEN
    RAISE EXCEPTION 'llm_usage_logs_feature_check missing';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'llm_usage_logs'
      AND policyname = 'Users can insert llm usage logs in own projects'
  )
  INTO has_insert_policy;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'llm_usage_logs'
      AND policyname = 'Users can view llm usage logs in own projects'
  )
  INTO has_select_policy;

  IF NOT has_insert_policy OR NOT has_select_policy THEN
    RAISE EXCEPTION 'llm_usage_logs RLS policies missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'delete_expired_llm_usage_logs'
      AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'delete_expired_llm_usage_logs SECURITY DEFINER function missing';
  END IF;

  SELECT has_function_privilege('anon', 'public.delete_expired_llm_usage_logs(interval)', 'EXECUTE')
  INTO anon_can_cleanup;
  SELECT has_function_privilege('authenticated', 'public.delete_expired_llm_usage_logs(interval)', 'EXECUTE')
  INTO authenticated_can_cleanup;
  SELECT has_function_privilege('service_role', 'public.delete_expired_llm_usage_logs(interval)', 'EXECUTE')
  INTO service_role_can_cleanup;

  IF anon_can_cleanup OR authenticated_can_cleanup OR NOT service_role_can_cleanup THEN
    RAISE EXCEPTION 'delete_expired_llm_usage_logs execute grants are incorrect';
  END IF;
END $$;
