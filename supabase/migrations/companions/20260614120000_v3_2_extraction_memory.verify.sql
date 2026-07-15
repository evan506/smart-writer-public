-- Verification for: 20260614120000_v3_2_extraction_memory.sql
--
-- Pure catalog inspection. No data required.

DO $$
BEGIN
  IF to_regclass('public.extraction_memory') IS NULL THEN
    RAISE EXCEPTION 'EXTRACTION MEMORY VERIFY FAILED: extraction_memory table missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'extraction_memory'
      AND indexname = 'extraction_memory_project_kind_rulekey_unique'
  ) THEN
    RAISE EXCEPTION 'EXTRACTION MEMORY VERIFY FAILED: unique (project_id, kind, rule_key) index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.extraction_memory'::regclass
      AND conname = 'extraction_memory_kind_check'
  ) THEN
    RAISE EXCEPTION 'EXTRACTION MEMORY VERIFY FAILED: kind check constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.extraction_memory'::regclass
      AND conname = 'extraction_memory_override_shape_check'
  ) THEN
    RAISE EXCEPTION 'EXTRACTION MEMORY VERIFY FAILED: override shape check constraint missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.extraction_memory'::regclass
      AND tgname = 'set_extraction_memory_updated_at'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'EXTRACTION MEMORY VERIFY FAILED: updated_at trigger missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_class
    WHERE oid = 'public.extraction_memory'::regclass
      AND relrowsecurity = true
  ) THEN
    RAISE EXCEPTION 'EXTRACTION MEMORY VERIFY FAILED: row level security not enabled';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'extraction_memory'
  ) < 4 THEN
    RAISE EXCEPTION 'EXTRACTION MEMORY VERIFY FAILED: expected 4 RLS policies (select/insert/update/delete)';
  END IF;
END $$;
