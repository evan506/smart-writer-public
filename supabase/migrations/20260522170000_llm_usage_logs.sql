-- LLM usage/cost operational logging.
--
-- This table intentionally stores provider metadata only. It must not store
-- prompt text, completion text, or duplicated manuscript content.

CREATE TABLE IF NOT EXISTS public.llm_usage_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  project_id uuid NOT NULL,
  user_id uuid,
  feature text NOT NULL,
  provider text DEFAULT 'openrouter'::text NOT NULL,
  model text NOT NULL,
  provider_response_id text,
  prompt_template_key text,
  prompt_template_version text,
  status text NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cached_prompt_tokens integer,
  reasoning_tokens integer,
  cost_usd numeric(12,8),
  latency_ms integer,
  retry_count integer DEFAULT 0 NOT NULL,
  timed_out boolean DEFAULT false NOT NULL,
  error_type text,
  raw_usage jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.llm_usage_logs
  ADD CONSTRAINT llm_usage_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.llm_usage_logs
  ADD CONSTRAINT llm_usage_logs_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.llm_usage_logs
  ADD CONSTRAINT llm_usage_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.llm_usage_logs
  ADD CONSTRAINT llm_usage_logs_feature_check
  CHECK (feature = ANY (ARRAY[
    'entity_extraction'::text,
    'analysis'::text,
    'embedding'::text,
    'report'::text,
    'chat'::text,
    'search_rag'::text
  ]));

ALTER TABLE public.llm_usage_logs
  ADD CONSTRAINT llm_usage_logs_status_check
  CHECK (status = ANY (ARRAY['success'::text, 'error'::text]));

CREATE INDEX idx_llm_usage_logs_created_at
  ON public.llm_usage_logs USING btree (created_at DESC);

CREATE INDEX idx_llm_usage_logs_project_created_at
  ON public.llm_usage_logs USING btree (project_id, created_at DESC);

CREATE INDEX idx_llm_usage_logs_user_created_at
  ON public.llm_usage_logs USING btree (user_id, created_at DESC);

CREATE INDEX idx_llm_usage_logs_feature_created_at
  ON public.llm_usage_logs USING btree (feature, created_at DESC);

ALTER TABLE public.llm_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert llm usage logs in own projects"
  ON public.llm_usage_logs AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    project_id IN (
      SELECT projects.id
      FROM public.projects
      WHERE projects.user_id = (SELECT auth.uid())
    )
    AND (user_id IS NULL OR user_id = (SELECT auth.uid()))
  );

CREATE POLICY "Users can view llm usage logs in own projects"
  ON public.llm_usage_logs AS PERMISSIVE FOR SELECT TO public
  USING (
    project_id IN (
      SELECT projects.id
      FROM public.projects
      WHERE projects.user_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.delete_expired_llm_usage_logs(
  retention interval DEFAULT interval '90 days'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.llm_usage_logs
  WHERE created_at < now() - retention;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_expired_llm_usage_logs(interval)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_expired_llm_usage_logs(interval)
  TO service_role;

COMMENT ON TABLE public.llm_usage_logs IS
  'LLM operational usage metadata only. Do not store prompt text, completion text, or manuscript content here. Retention target: 90 days.';

COMMENT ON FUNCTION public.delete_expired_llm_usage_logs(interval) IS
  'Deletes llm_usage_logs older than the supplied retention interval. Default retention is 90 days.';

GRANT ALL ON public.llm_usage_logs TO anon, authenticated, service_role;
