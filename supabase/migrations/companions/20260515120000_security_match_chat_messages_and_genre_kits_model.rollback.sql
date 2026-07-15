-- Rollback for: security_match_chat_messages_and_genre_kits_model
--
-- WARNING: This restores the PRE-FIX (vulnerable) behavior:
--   * match_chat_messages loses its ownership gate (RLS bypass returns).
--   * genre_kits write policies become USING (true) again (any logged-in
--     user can modify/delete shared kits).
-- Only run this to revert an unintended deployment.
--
-- It cannot perfectly restore the original duplicate uniques because the exact
-- original SELECT policy name is unknown; it recreates a single authenticated
-- SELECT policy and a single unique on genre_type.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Revert match_chat_messages to the original (no ownership check)
-- ---------------------------------------------------------------------------
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
-- 2. Revert genre_kits RLS policies to permissive
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS select_genre_kits ON public.genre_kits;
DROP POLICY IF EXISTS insert_genre_kits ON public.genre_kits;
DROP POLICY IF EXISTS update_genre_kits ON public.genre_kits;
DROP POLICY IF EXISTS delete_genre_kits ON public.genre_kits;

CREATE POLICY select_genre_kits
  ON public.genre_kits FOR SELECT TO authenticated
  USING (true);

CREATE POLICY insert_genre_kits
  ON public.genre_kits FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY update_genre_kits
  ON public.genre_kits FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY delete_genre_kits
  ON public.genre_kits FOR DELETE TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- 3. Revert uniques
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.genre_kits_global_genre_type_uniq;
DROP INDEX IF EXISTS public.genre_kits_user_genre_type_uniq;

-- Recreate a single unique on genre_type. NOTE: this will FAIL if, after the
-- forward migration ran, multiple rows now share a genre_type (e.g. a global
-- kit + a user custom kit). Resolve duplicates before rolling back.
ALTER TABLE public.genre_kits
  ADD CONSTRAINT genre_kits_genre_type_key UNIQUE (genre_type);

-- ---------------------------------------------------------------------------
-- 4. Drop the added columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.genre_kits DROP COLUMN IF EXISTS is_public;
ALTER TABLE public.genre_kits DROP COLUMN IF EXISTS user_id;

COMMIT;
