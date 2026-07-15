-- Migration: integrity_constraints_fk_and_indexes
-- Authored: 2026-05-15 (DB integrity track: wt-db-integrity)
--
-- Purpose:
--   1. Add a UNIQUE constraint on entity_links (from_id, to_id, relation_type)
--      to prevent duplicate relationship rows at the DB level.
--   2. Drop the redundant/conflicting partial unique index
--      idx_entity_suggestions_unique (chapter_id,name,type) WHERE status='PENDING'.
--      The named constraint entity_suggestions_chapter_name_unique (chapter_id,name)
--      is the canonical one and matches app upsert onConflict:'chapter_id,name'.
--   3. Re-point user_id foreign keys (personas, chat_conversations) to
--      ON DELETE CASCADE so auth.users rows can be deleted.
--   4. Add missing foreign-key indexes (perf advisor):
--      entity_suggestions.matched_entity_id, chat_conversations.user_id.
--
-- Live-DB verified facts at authoring time:
--   * entity_links: 0 duplicate (from_id,to_id,relation_type) groups, 0 extra
--     rows -> UNIQUE can be added directly, NO dedup needed.
--   * personas: 0 rows; chat_conversations: 0 rows -> FK re-point is zero-risk.
--   * idx_entity_suggestions_unique is redundant with the named constraint;
--     dropping it does not affect app onConflict 'chapter_id,name' behaviour.
--
-- This migration does NOT touch genre_kits (handled by a separate security
-- track) and preserves all RPC/return contracts.
--
-- Idempotent where reasonable: guards via IF EXISTS / IF NOT EXISTS and a
-- DO-block existence check for the entity_links UNIQUE constraint.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. entity_links: UNIQUE (from_id, to_id, relation_type)
-- ---------------------------------------------------------------------------
-- Safe to add directly: live DB has 0 duplicate groups / 0 extra rows.
-- Application-level dedup (manual checks / upserts) remains valid and is now
-- additionally enforced by the database. Existing single-column indexes
-- (idx_entity_links_from_id / _to_id / _relation) are retained; this composite
-- UNIQUE additionally provides an index usable for (from_id,to_id,relation_type)
-- lookups.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.entity_links'::regclass
      AND conname  = 'entity_links_from_to_rel_unique'
  ) THEN
    ALTER TABLE public.entity_links
      ADD CONSTRAINT entity_links_from_to_rel_unique
      UNIQUE (from_id, to_id, relation_type);
  END IF;
END
$$;

COMMENT ON CONSTRAINT entity_links_from_to_rel_unique ON public.entity_links IS
  'Prevents duplicate relationship rows for the same (from_id, to_id, relation_type). App-level dedup/upsert remains valid and is now DB-enforced. Note: (A,B) and (B,A) are distinct rows; bidirectional relations may be stored as two rows or via direction=BI.';

-- ---------------------------------------------------------------------------
-- 2. Drop redundant partial unique index on entity_suggestions
-- ---------------------------------------------------------------------------
-- entity_suggestions_chapter_name_unique UNIQUE (chapter_id, name) is the
-- canonical constraint and matches the app upsert onConflict:'chapter_id,name'.
-- idx_entity_suggestions_unique UNIQUE (chapter_id,name,type) WHERE
-- status='PENDING' is redundant and causes implicit/confusing conflicts.
DROP INDEX IF EXISTS public.idx_entity_suggestions_unique;

COMMENT ON CONSTRAINT entity_suggestions_chapter_name_unique ON public.entity_suggestions IS
  'Canonical uniqueness for suggestions. App upsert onConflict:''chapter_id,name'' targets this constraint. The redundant partial index idx_entity_suggestions_unique (chapter_id,name,type) WHERE status=''PENDING'' was dropped in migration integrity_constraints_fk_and_indexes.';

-- ---------------------------------------------------------------------------
-- 3. Re-point user_id FKs to ON DELETE CASCADE
-- ---------------------------------------------------------------------------
-- Both tables have 0 rows -> zero data risk. Without ON DELETE CASCADE,
-- deleting an auth.users row fails because these FKs have no ON DELETE action.

-- personas.user_id -> auth.users(id)
ALTER TABLE public.personas
  DROP CONSTRAINT IF EXISTS personas_user_fkey;
ALTER TABLE public.personas
  ADD CONSTRAINT personas_user_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- chat_conversations.user_id -> auth.users(id)
ALTER TABLE public.chat_conversations
  DROP CONSTRAINT IF EXISTS chat_conversations_user_fkey;
ALTER TABLE public.chat_conversations
  ADD CONSTRAINT chat_conversations_user_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 4. Add missing FK indexes (perf advisor)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_entity_suggestions_matched_entity_id
  ON public.entity_suggestions (matched_entity_id);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id
  ON public.chat_conversations (user_id);

COMMIT;
