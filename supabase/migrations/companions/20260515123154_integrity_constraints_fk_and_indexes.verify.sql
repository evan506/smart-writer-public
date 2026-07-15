-- Verification for: 20260515123154_integrity_constraints_fk_and_indexes.sql
--
-- Read-only checks + a rolled-back transaction that proves the new UNIQUE
-- constraint actually rejects a duplicate insert WITHOUT persisting test data.
-- Run AFTER applying the forward migration. None of these statements mutate
-- committed state (the only INSERTs run inside a ROLLBACK block).

-- ===========================================================================
-- CHECK 1: entity_links UNIQUE constraint exists with the expected definition
-- Expect: 1 row, definition = UNIQUE (from_id, to_id, relation_type)
-- ===========================================================================
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.entity_links'::regclass
  AND conname  = 'entity_links_from_to_rel_unique';

-- ===========================================================================
-- CHECK 2: the new UNIQUE constraint actually REJECTS a duplicate insert.
-- Runs entirely inside a transaction that is ROLLED BACK -> no test data
-- persists. The second INSERT must raise:
--   ERROR: duplicate key value violates unique constraint
--          "entity_links_from_to_rel_unique"
-- ===========================================================================
BEGIN;

-- Use two real entity ids from the same project so FK + direction/weight
-- checks pass. (Adjust the LIMIT/order if entities table is empty in a test
-- environment; in that case CHECK 2 is not applicable.)
DO $$
DECLARE
  v_from uuid;
  v_to   uuid;
BEGIN
  SELECT e1.id, e2.id
    INTO v_from, v_to
  FROM public.entities e1
  JOIN public.entities e2
    ON e1.project_id = e2.project_id
   AND e1.id <> e2.id
  LIMIT 1;

  IF v_from IS NULL OR v_to IS NULL THEN
    RAISE NOTICE 'CHECK 2 SKIPPED: need >= 2 entities in one project to test.';
    RETURN;
  END IF;

  -- First insert: should succeed.
  INSERT INTO public.entity_links (from_id, to_id, relation_type, direction, weight)
  VALUES (v_from, v_to, 'ALLY', 'UNI', 0.5);

  -- Second identical (from_id,to_id,relation_type): must violate the UNIQUE.
  BEGIN
    INSERT INTO public.entity_links (from_id, to_id, relation_type, direction, weight)
    VALUES (v_from, v_to, 'ALLY', 'UNI', 0.5);
    RAISE EXCEPTION 'CHECK 2 FAILED: duplicate insert was ACCEPTED (UNIQUE not enforced)';
  EXCEPTION
    WHEN unique_violation THEN
      RAISE NOTICE 'CHECK 2 PASSED: duplicate insert correctly rejected by entity_links_from_to_rel_unique';
  END;
END
$$;

ROLLBACK;  -- discard all CHECK 2 test rows

-- ===========================================================================
-- CHECK 3: redundant partial unique index is GONE.
-- Expect: 0 rows.
-- ===========================================================================
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'entity_suggestions'
  AND indexname  = 'idx_entity_suggestions_unique';

-- ...and the canonical constraint is still present.
-- Expect: 1 row, definition = UNIQUE (chapter_id, name)
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.entity_suggestions'::regclass
  AND conname  = 'entity_suggestions_chapter_name_unique';

-- ===========================================================================
-- CHECK 4: user_id FKs now ON DELETE CASCADE.
-- Expect: 2 rows, each definition ending in 'ON DELETE CASCADE'.
-- ===========================================================================
SELECT
  conrelid::regclass AS table_name,
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN ('personas_user_fkey', 'chat_conversations_user_fkey')
ORDER BY conname;

-- ===========================================================================
-- CHECK 5: new FK indexes exist.
-- Expect: 2 rows.
-- ===========================================================================
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_entity_suggestions_matched_entity_id',
    'idx_chat_conversations_user_id'
  )
ORDER BY indexname;
