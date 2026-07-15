-- LOCAL-ONLY behavioral fixture for: 20260621120000_v3_3_plot_threads.sql
--
-- ⚠️  NEVER run this on the shared remote.
--
-- This file is executed ONLY by `scripts/db-replay-verify.sh`, which globs
-- `*.fixture.sql` and runs them against the DISPOSABLE pgvector replay
-- container. The remote apply/verify path runs ONLY `*.verify.sql` (catalog /
-- function-source inspection, mutation-free) and never references this file.
--
-- It proves the DB-level row-kind allowlist behaviorally: linking a
-- CHARACTER_PLAN or PLACE_PLAN card to a plot thread must fail with SQLSTATE
-- 23514 (check_violation), while an EPISODE card must succeed. The whole thing
-- runs inside a transaction that is ROLLED BACK, so it leaves no rows even on
-- the throwaway DB.

BEGIN;

DO $$
DECLARE
  v_proj uuid;
  v_root uuid;
  v_episode uuid;
  v_char uuid;
  v_place uuid;
  v_thread uuid;
  v_char_rejected boolean := false;
  v_place_rejected boolean := false;
  v_episode_accepted boolean := false;
BEGIN
  INSERT INTO public.projects (id, title)
    VALUES (gen_random_uuid(), '__v33_fixture_project__')
    RETURNING id INTO v_proj;

  INSERT INTO public.planning_blocks (project_id, parent_id, kind, title, structure_key)
    VALUES (v_proj, NULL, 'ROOT', '__v33_root__', 'START')
    RETURNING id INTO v_root;

  INSERT INTO public.planning_blocks (project_id, parent_id, kind, title)
    VALUES (v_proj, v_root, 'EPISODE', '__v33_episode__')
    RETURNING id INTO v_episode;
  INSERT INTO public.planning_blocks (project_id, parent_id, kind, title)
    VALUES (v_proj, v_root, 'CHARACTER_PLAN', '__v33_char__')
    RETURNING id INTO v_char;
  INSERT INTO public.planning_blocks (project_id, parent_id, kind, title)
    VALUES (v_proj, v_root, 'PLACE_PLAN', '__v33_place__')
    RETURNING id INTO v_place;

  INSERT INTO public.plot_threads (project_id, title)
    VALUES (v_proj, '__v33_thread__')
    RETURNING id INTO v_thread;

  -- Disallowed: CHARACTER_PLAN must be rejected with 23514 (check_violation).
  BEGIN
    INSERT INTO public.plot_thread_planning_blocks (project_id, plot_thread_id, planning_block_id)
      VALUES (v_proj, v_thread, v_char);
  EXCEPTION WHEN check_violation THEN
    v_char_rejected := true;
  END;

  -- Disallowed: PLACE_PLAN must be rejected with 23514.
  BEGIN
    INSERT INTO public.plot_thread_planning_blocks (project_id, plot_thread_id, planning_block_id)
      VALUES (v_proj, v_thread, v_place);
  EXCEPTION WHEN check_violation THEN
    v_place_rejected := true;
  END;

  -- Allowed: EPISODE must be accepted (guards against an over-broad allowlist).
  BEGIN
    INSERT INTO public.plot_thread_planning_blocks (project_id, plot_thread_id, planning_block_id)
      VALUES (v_proj, v_thread, v_episode);
    v_episode_accepted := true;
  EXCEPTION WHEN check_violation THEN
    v_episode_accepted := false;
  END;

  IF NOT v_char_rejected THEN
    RAISE EXCEPTION 'PLOT THREADS FIXTURE FAILED: CHARACTER_PLAN link was not rejected (expected SQLSTATE 23514)';
  END IF;
  IF NOT v_place_rejected THEN
    RAISE EXCEPTION 'PLOT THREADS FIXTURE FAILED: PLACE_PLAN link was not rejected (expected SQLSTATE 23514)';
  END IF;
  IF NOT v_episode_accepted THEN
    RAISE EXCEPTION 'PLOT THREADS FIXTURE FAILED: EPISODE link was rejected (allowlist is over-broad / wrong)';
  END IF;

  RAISE NOTICE 'PLOT THREADS FIXTURE PASSED: CHARACTER_PLAN/PLACE_PLAN rejected with 23514, EPISODE accepted.';
END
$$;

ROLLBACK;
