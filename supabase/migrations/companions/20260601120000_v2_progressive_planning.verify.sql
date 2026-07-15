-- Verification for: 20260601120000_v2_progressive_planning.sql
--
-- Pure catalog inspection. No data required.

DO $$
BEGIN
  IF to_regclass('public.planning_blocks') IS NULL THEN
    RAISE EXCEPTION 'PROGRESSIVE PLANNING VERIFY FAILED: planning_blocks missing';
  END IF;

  IF to_regclass('public.planning_links') IS NULL THEN
    RAISE EXCEPTION 'PROGRESSIVE PLANNING VERIFY FAILED: planning_links missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'planning_blocks'
      AND indexname = 'planning_blocks_root_structure_unique'
  ) THEN
    RAISE EXCEPTION 'PROGRESSIVE PLANNING VERIFY FAILED: root structure unique index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.planning_blocks'::regclass
      AND conname = 'planning_blocks_root_shape_check'
  ) THEN
    RAISE EXCEPTION 'PROGRESSIVE PLANNING VERIFY FAILED: root shape check missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.planning_blocks'::regclass
      AND tgname = 'set_planning_blocks_updated_at'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PROGRESSIVE PLANNING VERIFY FAILED: updated_at trigger missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE oid = 'public.enforce_planning_block_parent_project()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'PROGRESSIVE PLANNING VERIFY FAILED: parent project guard function missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.planning_blocks'::regclass
      AND tgname = 'enforce_planning_block_parent_project'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'PROGRESSIVE PLANNING VERIFY FAILED: parent project guard trigger missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'planning_blocks'
      AND policyname = 'planning_blocks_select_own'
  ) THEN
    RAISE EXCEPTION 'PROGRESSIVE PLANNING VERIFY FAILED: planning_blocks RLS select policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'planning_links'
      AND policyname = 'planning_links_insert_own'
  ) THEN
    RAISE EXCEPTION 'PROGRESSIVE PLANNING VERIFY FAILED: planning_links RLS insert policy missing';
  END IF;

  RAISE NOTICE 'PROGRESSIVE PLANNING VERIFY PASSED: tables, constraints, indexes, trigger, and RLS policies exist.';
END
$$;
