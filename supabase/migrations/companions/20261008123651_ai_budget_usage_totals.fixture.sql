-- LOCAL ONLY: disposable PostgreSQL/Supabase fixture. Never run in Production.
BEGIN;
INSERT INTO auth.users(id) VALUES
  ('a1000000-0000-4000-8000-000000000001'), ('a1000000-0000-4000-8000-000000000002');
INSERT INTO public.projects(id,user_id,title) VALUES
  ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','budget fixture1'),
  ('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','budget fixture2'),
  ('b1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002','other owner');
INSERT INTO public.llm_usage_logs(project_id,user_id,feature,model,status,cost_usd,created_at)
SELECT 'b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'embedding','fixture','success',0.001,'2026-06-15T01:00:00Z' FROM generate_series(1,15000);
INSERT INTO public.llm_usage_logs(project_id,user_id,feature,model,status,cost_usd,created_at) VALUES
  ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','embedding','fixture','success',2,'2026-06-01T00:00:00Z'),
  ('b1000000-0000-4000-8000-000000000001',NULL,'embedding','fixture','success',3,'2026-06-15T01:00:00Z'),
  ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','embedding','fixture','success',NULL,'2026-06-15T01:00:00Z'),
  ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','embedding','fixture','success',100,'2026-05-31T23:59:59.999Z'),
  ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','embedding','fixture','success',100,'2026-06-15T12:00:00.001Z'),
  ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','embedding','fixture','success',1,'2026-06-15T00:00:00Z'),
  ('b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','embedding','fixture','success',1,'2026-06-15T12:00:00Z'),
  ('b1000000-0000-4000-8000-000000000002','a1000000-0000-4000-8000-000000000001','embedding','fixture','success',4,'2026-06-15T01:00:00Z'),
  ('b1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000002','embedding','fixture','success',100,'2026-06-15T01:00:00Z');

SELECT set_config('request.jwt.claim.sub','a1000000-0000-4000-8000-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_llm_usage_totals(
    'b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    true,true,true,true,'2026-06-15T12:00:00Z');
  IF NOT r.authorized OR r.project_day_usd<>20 OR r.project_month_usd<>22 OR
    r.user_day_usd<>21 OR r.user_month_usd<>23 OR
    r.project_unknown_cost_count<>1 OR r.user_unknown_cost_count<>1 THEN
    RAISE EXCEPTION 'large/UTC/null-user/multiple-project totals mismatch: %',r;
  END IF;
  SELECT * INTO r FROM public.get_llm_usage_totals(
    'b1000000-0000-4000-8000-000000000001',NULL,true,false,false,false,'2026-06-15T12:00:00Z');
  IF NOT r.authorized OR r.project_month_usd<>20 OR r.user_month_usd<>0 OR r.user_unknown_cost_count<>0 THEN
    RAISE EXCEPTION 'disabled user/daily-only query mismatch: %',r;
  END IF;
  SELECT * INTO r FROM public.get_llm_usage_totals(
    'b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    false,false,true,false,'2026-06-15T12:00:00Z');
  IF NOT r.authorized OR r.project_month_usd<>0 OR r.project_unknown_cost_count<>0 OR r.user_month_usd<>21 THEN
    RAISE EXCEPTION 'disabled project query mismatch: %',r;
  END IF;
  SELECT * INTO r FROM public.get_llm_usage_totals(
    'b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
    true,true,true,true,'2026-06-15T09:00:00+09');
  IF r.project_day_usd<>1 OR r.project_month_usd<>3 OR r.user_day_usd<>1 OR r.user_month_usd<>3 THEN
    RAISE EXCEPTION 'timezone boundary mismatch: %',r;
  END IF;
  SELECT * INTO r FROM public.get_llm_usage_totals(
    'b1000000-0000-4000-8000-000000000003','a1000000-0000-4000-8000-000000000001',
    true,true,true,true,'2026-06-15T12:00:00Z');
  IF r.authorized OR r.project_month_usd<>0 OR r.user_month_usd<>0 THEN
    RAISE EXCEPTION 'foreign project must not authorize even user totals';
  END IF;
  SELECT * INTO r FROM public.get_llm_usage_totals(
    'b1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000002',
    true,true,true,true,'2026-06-15T12:00:00Z');
  IF r.authorized OR r.project_month_usd<>0 OR r.user_month_usd<>0 THEN
    RAISE EXCEPTION 'foreign user scope leaked totals';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub','',true);
DO $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM public.get_llm_usage_totals(
    'b1000000-0000-4000-8000-000000000001',NULL,true,true,false,false,'2026-06-15T12:00:00Z');
  IF r.authorized OR r.project_month_usd<>0 THEN RAISE EXCEPTION 'missing identity leaked totals'; END IF;
END $$;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.get_llm_usage_totals(
      'b1000000-0000-4000-8000-000000000001',NULL,true,true,false,false,'2026-06-15T12:00:00Z');
    RAISE EXCEPTION 'anonymous execute unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
