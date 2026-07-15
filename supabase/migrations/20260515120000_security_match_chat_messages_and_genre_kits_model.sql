-- Migration: security_match_chat_messages_and_genre_kits_model
-- Purpose: P0 security hardening
--   1. match_chat_messages: add ownership gate (currently SECURITY DEFINER with
--      no ownership check -> any caller knowing a conversation_id can read
--      other users' chat history, bypassing RLS).
--   2. genre_kits: introduce owner + visibility model so a logged-in user can
--      no longer modify/delete shared (global) kits. Currently the
--      INSERT/UPDATE/DELETE policies are USING (true)/WITH CHECK (true).
--
-- Author: wt-db-security track
-- NOTE: This file is authored only. It is NOT applied to any remote DB here.
--
-- Idempotency: uses CREATE OR REPLACE / IF EXISTS / IF NOT EXISTS where
-- reasonable so a partial re-run is safe.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. match_chat_messages — add ownership gate
-- ---------------------------------------------------------------------------
-- Keeps SECURITY DEFINER and SET search_path = public, and an IDENTICAL
-- RETURNS TABLE signature/column order/types. Only adds an early-return guard:
-- if p_conversation_id does not belong to auth.uid() (via
-- chat_conversations.user_id), return zero rows.

CREATE OR REPLACE FUNCTION public.match_chat_messages(
  query_embedding text,
  p_conversation_id uuid,
  match_threshold double precision DEFAULT 0.5,
  match_count integer DEFAULT 5
)
 RETURNS TABLE(
   id uuid,
   role text,
   content text,
   emotion_key text,
   similarity double precision,
   created_at timestamp with time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Ownership gate: only the conversation owner may read its messages.
  -- Returns empty set for non-owners / unauthenticated callers.
  IF NOT EXISTS (
    SELECT 1
    FROM public.chat_conversations c
    WHERE c.id = p_conversation_id
      AND c.user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.id, m.role, m.content, m.emotion_key,
    1 - (m.embedding <=> query_embedding::vector) AS similarity, m.created_at
  FROM public.chat_messages m
  WHERE m.conversation_id = p_conversation_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding::vector) > match_threshold
  ORDER BY m.embedding <=> query_embedding::vector
  LIMIT match_count;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. genre_kits — owner + visibility columns
-- ---------------------------------------------------------------------------
-- user_id: NULL = global/system kit (manageable only by service_role, since no
--          normal-user policy allows writing rows with NULL user_id).
-- is_public: when true, a kit is visible to everyone (used for the seeded
--            global library kits and any user kit a user chooses to publish).

ALTER TABLE public.genre_kits
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.genre_kits
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 3. Backfill existing rows
-- ---------------------------------------------------------------------------
-- Existing seed rows are the global library: keep user_id NULL and make them
-- publicly visible so they stay broadly available.

UPDATE public.genre_kits
SET is_public = true
WHERE user_id IS NULL
  AND is_public IS DISTINCT FROM true;

-- ---------------------------------------------------------------------------
-- 4. Drop duplicate uniques on genre_type
-- ---------------------------------------------------------------------------
-- The remote DB has TWO duplicate uniques over (genre_type):
--   genre_kits_genre_type_key      UNIQUE(genre_type)
--   genre_kits_genre_type_unique   UNIQUE(genre_type)
-- Both block per-user custom kits sharing a genre with the global library,
-- so both are dropped.

ALTER TABLE public.genre_kits
  DROP CONSTRAINT IF EXISTS genre_kits_genre_type_key;

ALTER TABLE public.genre_kits
  DROP CONSTRAINT IF EXISTS genre_kits_genre_type_unique;

-- Defensive: if either was created as a bare unique index (not a constraint).
DROP INDEX IF EXISTS public.genre_kits_genre_type_key;
DROP INDEX IF EXISTS public.genre_kits_genre_type_unique;

-- ---------------------------------------------------------------------------
-- 5. Replace with partial uniques
-- ---------------------------------------------------------------------------
-- Global library: at most one global kit per genre_type.
CREATE UNIQUE INDEX IF NOT EXISTS genre_kits_global_genre_type_uniq
  ON public.genre_kits (genre_type)
  WHERE user_id IS NULL;

-- Per user: at most one custom kit per genre_type per user. A user's custom
-- kit may share a genre_type with the global library.
CREATE UNIQUE INDEX IF NOT EXISTS genre_kits_user_genre_type_uniq
  ON public.genre_kits (user_id, genre_type)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Replace RLS policies
-- ---------------------------------------------------------------------------
-- Drop existing policies defensively. The remote DB has these write policies:
--   insert_genre_kits / update_genre_kits / delete_genre_kits (all USING true)
-- plus an authenticated SELECT policy whose exact name is not known from the
-- repo (no genre_kits migration exists). Drop all plausible names so the
-- recreation below is the single source of truth.
--
-- Live-DB verified (2026-05-15) actual policy names on public.genre_kits:
--   SELECT "Authenticated users can view genre kits"  USING (auth.role()='authenticated')
--   INSERT insert_genre_kits                          WITH CHECK (true)
--   UPDATE update_genre_kits                          USING (true) WITH CHECK (true)
--   DELETE delete_genre_kits                          USING (true)
-- The confirmed SELECT name is dropped explicitly first (RLS policies are
-- OR-combined: leaving the old auth.role()='authenticated' SELECT policy in
-- place would let any authenticated user read every kit, defeating the new
-- owner/visibility model). The remaining names are kept defensively.
DROP POLICY IF EXISTS "Authenticated users can view genre kits" ON public.genre_kits;
DROP POLICY IF EXISTS select_genre_kits ON public.genre_kits;
DROP POLICY IF EXISTS insert_genre_kits ON public.genre_kits;
DROP POLICY IF EXISTS update_genre_kits ON public.genre_kits;
DROP POLICY IF EXISTS delete_genre_kits ON public.genre_kits;
-- Other plausible auto-generated / dashboard-created names (defensive):
DROP POLICY IF EXISTS "genre_kits_select" ON public.genre_kits;
DROP POLICY IF EXISTS "genre_kits select" ON public.genre_kits;
DROP POLICY IF EXISTS "genre_kits_select_policy" ON public.genre_kits;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.genre_kits;
DROP POLICY IF EXISTS "Authenticated users can read genre_kits" ON public.genre_kits;
DROP POLICY IF EXISTS "Allow authenticated read" ON public.genre_kits;
DROP POLICY IF EXISTS "read_genre_kits" ON public.genre_kits;

-- Ensure RLS is on (no-op if already enabled).
ALTER TABLE public.genre_kits ENABLE ROW LEVEL SECURITY;

-- SELECT: global kits (user_id IS NULL), own kits, or anything explicitly
-- published. Wrapping auth.uid() in a scalar subselect also fixes the
-- auth_rls_initplan performance advisory (evaluated once per query).
CREATE POLICY select_genre_kits
  ON public.genre_kits
  FOR SELECT
  TO authenticated
  USING (
    user_id IS NULL
    OR user_id = (select auth.uid())
    OR is_public = true
  );

-- INSERT: a normal user may only create rows owned by themselves. Global kits
-- (user_id NULL) can therefore only be inserted by service_role (which
-- bypasses RLS).
CREATE POLICY insert_genre_kits
  ON public.genre_kits
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
  );

-- UPDATE: only the owner. Global kits are not updatable by normal users.
CREATE POLICY update_genre_kits
  ON public.genre_kits
  FOR UPDATE
  TO authenticated
  USING (
    user_id = (select auth.uid())
  )
  WITH CHECK (
    user_id = (select auth.uid())
  );

-- DELETE: only the owner. Global kits are not deletable by normal users.
CREATE POLICY delete_genre_kits
  ON public.genre_kits
  FOR DELETE
  TO authenticated
  USING (
    user_id = (select auth.uid())
  );

COMMIT;
