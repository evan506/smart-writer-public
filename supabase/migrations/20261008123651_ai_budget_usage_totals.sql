-- Read-only, single-statement UTC budget aggregation. Keep existing project/time
-- and user/time indexes; no usage rows are returned through PostgREST row caps.
CREATE FUNCTION public.get_llm_usage_totals(
  p_project_id uuid,
  p_user_id uuid,
  p_project_active boolean,
  p_project_monthly boolean,
  p_user_active boolean,
  p_user_monthly boolean,
  p_as_of timestamptz
)
RETURNS TABLE (
  authorized boolean,
  project_day_usd numeric,
  project_month_usd numeric,
  user_day_usd numeric,
  user_month_usd numeric,
  project_unknown_cost_count bigint,
  user_unknown_cost_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $$
  WITH scope AS MATERIALIZED (
    SELECT
      (SELECT auth.uid()) IS NOT NULL
      AND p_as_of IS NOT NULL AND isfinite(p_as_of)
      AND (NOT p_user_active OR p_user_id = (SELECT auth.uid()))
      AND (p_user_id IS NULL OR p_user_id = (SELECT auth.uid()))
      AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = p_project_id AND p.user_id = (SELECT auth.uid())
      ) AS allowed
  ), project_totals AS (
    SELECT
      coalesce(sum(l.cost_usd) FILTER (WHERE l.created_at >= (date_trunc('day', p_as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')), 0) AS day_usd,
      coalesce(sum(l.cost_usd), 0) AS month_usd,
      count(*) FILTER (WHERE l.cost_usd IS NULL) AS unknown_cost_count
    FROM scope s JOIN public.llm_usage_logs l ON s.allowed AND p_project_active
      AND l.project_id = p_project_id
      AND l.created_at >= (date_trunc(CASE WHEN p_project_monthly THEN 'month' ELSE 'day' END, p_as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
      AND l.created_at <= p_as_of
  ), user_totals AS (
    SELECT
      coalesce(sum(l.cost_usd) FILTER (WHERE l.created_at >= (date_trunc('day', p_as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')), 0) AS day_usd,
      coalesce(sum(l.cost_usd), 0) AS month_usd,
      count(*) FILTER (WHERE l.cost_usd IS NULL) AS unknown_cost_count
    FROM scope s JOIN public.llm_usage_logs l ON s.allowed AND p_user_active
      AND l.user_id = p_user_id
      AND l.created_at >= (date_trunc(CASE WHEN p_user_monthly THEN 'month' ELSE 'day' END, p_as_of AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
      AND l.created_at <= p_as_of
  )
  SELECT coalesce(s.allowed, false), p.day_usd, p.month_usd,
    u.day_usd, u.month_usd, p.unknown_cost_count, u.unknown_cost_count
  FROM scope s CROSS JOIN project_totals p CROSS JOIN user_totals u;
$$;

REVOKE ALL ON FUNCTION public.get_llm_usage_totals(uuid, uuid, boolean, boolean, boolean, boolean, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_llm_usage_totals(uuid, uuid, boolean, boolean, boolean, boolean, timestamptz)
  TO authenticated;
COMMENT ON FUNCTION public.get_llm_usage_totals(uuid, uuid, boolean, boolean, boolean, boolean, timestamptz)
  IS 'Owner-bound read-only usage aggregation; observed spend, not a reservation or strict concurrent spend cap.';
