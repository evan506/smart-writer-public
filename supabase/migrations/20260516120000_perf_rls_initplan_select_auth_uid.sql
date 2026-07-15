-- ============================================================================
-- Performance: wrap auth.uid() in (select auth.uid()) in RLS policies (P2)
-- ============================================================================
-- Supabase performance advisor `auth_rls_initplan` (lint 0003) flags 37 RLS
-- policies across 12 public tables that call `auth.uid()` directly. Postgres
-- re-evaluates a volatile/STABLE function reference once PER ROW inside an RLS
-- predicate. Wrapping it as `(select auth.uid())` turns it into an InitPlan
-- (evaluated ONCE per query), which is the Supabase-recommended fix:
--   https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- This migration ONLY rewrites the predicate expression. It is a pure
-- performance optimization:
--   * policy NAME, COMMAND (SELECT/INSERT/UPDATE/DELETE/ALL), ROLES, and
--     PERMISSIVE/RESTRICTIVE are all preserved (ALTER POLICY, not DROP/CREATE).
--   * the boolean meaning of every USING / WITH CHECK clause is unchanged
--     ((select auth.uid()) returns the exact same uuid as auth.uid()).
--   * the presence/absence of WITH CHECK is preserved exactly as on remote
--     (e.g. entity_suggestions UPDATE keeps USING only, no WITH CHECK).
--
-- OUT OF SCOPE (intentionally NOT touched):
--   * public.genre_kits  (4 policies)  -- already `( SELECT auth.uid() )`
--   * public.analysis_jobs (4 policies) -- already `( SELECT auth.uid() )`
--   * SECURITY DEFINER function bodies, `vector` in public, unused indexes,
--     leaked-password protection -- separate follow-up items.
--
-- Inventory impact: NONE. 45 policies in -> 45 policies out (ALTER only).
-- Companions: .verify.sql (schema-only assertions) / .rollback.sql.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- projects  (4)  -- predicate: (auth.uid() = user_id)
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can delete own projects" ON public.projects
  USING (((select auth.uid()) = user_id));

ALTER POLICY "Users can insert own projects" ON public.projects
  WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "Users can update own projects" ON public.projects
  USING (((select auth.uid()) = user_id))
  WITH CHECK (((select auth.uid()) = user_id));

ALTER POLICY "Users can view own projects" ON public.projects
  USING (((select auth.uid()) = user_id));

-- ---------------------------------------------------------------------------
-- chapters  (4)  -- predicate: project_id IN (own projects)
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can delete chapters in own projects" ON public.chapters
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can insert chapters in own projects" ON public.chapters
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can update chapters in own projects" ON public.chapters
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))))
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can view chapters in own projects" ON public.chapters
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

-- ---------------------------------------------------------------------------
-- entities  (4)  -- predicate: project_id IN (own projects)
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can delete entities in own projects" ON public.entities
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can insert entities in own projects" ON public.entities
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can update entities in own projects" ON public.entities
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))))
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can view entities in own projects" ON public.entities
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

-- ---------------------------------------------------------------------------
-- entity_suggestions  (4)  -- predicate: project_id IN (own projects)
-- NOTE: UPDATE has USING only on remote (with_check NULL) -> keep it that way.
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can delete suggestions for their projects" ON public.entity_suggestions
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can insert suggestions for their projects" ON public.entity_suggestions
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can update suggestions for their projects" ON public.entity_suggestions
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can view suggestions for their projects" ON public.entity_suggestions
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

-- ---------------------------------------------------------------------------
-- foreshadows  (4)  -- predicate: project_id IN (own projects)
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can delete foreshadows in own projects" ON public.foreshadows
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can insert foreshadows in own projects" ON public.foreshadows
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can update foreshadows in own projects" ON public.foreshadows
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))))
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can view foreshadows in own projects" ON public.foreshadows
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

-- ---------------------------------------------------------------------------
-- rag_logs  (2)  -- predicate: project_id IN (own projects)
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can insert rag logs in own projects" ON public.rag_logs
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

ALTER POLICY "Users can view rag logs in own projects" ON public.rag_logs
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = (select auth.uid())))));

-- ---------------------------------------------------------------------------
-- chunks  (4)  -- predicate: chapter_id IN (chapters of own projects)
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can delete chunks in own projects" ON public.chunks
  USING ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))));

ALTER POLICY "Users can insert chunks in own projects" ON public.chunks
  WITH CHECK ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))));

ALTER POLICY "Users can update chunks in own projects" ON public.chunks
  USING ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))))
  WITH CHECK ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))));

ALTER POLICY "Users can view chunks in own projects" ON public.chunks
  USING ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))));

-- ---------------------------------------------------------------------------
-- entity_links  (4)  -- predicate: from_id IN (entities of own projects)
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can delete own entity links" ON public.entity_links
  USING ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))));

ALTER POLICY "Users can insert own entity links" ON public.entity_links
  WITH CHECK ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))));

ALTER POLICY "Users can update own entity links" ON public.entity_links
  USING ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))))
  WITH CHECK ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))));

ALTER POLICY "Users can view own entity links" ON public.entity_links
  USING ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = (select auth.uid())))))));

-- ---------------------------------------------------------------------------
-- mentions  (4)  -- predicate: chunk_id IN (chunks of own projects)
-- ---------------------------------------------------------------------------
ALTER POLICY "Users can delete mentions in own projects" ON public.mentions
  USING ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = (select auth.uid())))))))));

ALTER POLICY "Users can insert mentions in own projects" ON public.mentions
  WITH CHECK ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = (select auth.uid())))))))));

ALTER POLICY "Users can update mentions in own projects" ON public.mentions
  USING ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = (select auth.uid())))))))))
  WITH CHECK ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = (select auth.uid())))))))));

ALTER POLICY "Users can view mentions in own projects" ON public.mentions
  USING ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = (select auth.uid())))))))));

-- ---------------------------------------------------------------------------
-- chat_conversations  (1)  -- ALL, USING only: (user_id = auth.uid())
-- ---------------------------------------------------------------------------
ALTER POLICY "Users manage own conversations" ON public.chat_conversations
  USING ((user_id = (select auth.uid())));

-- ---------------------------------------------------------------------------
-- chat_messages  (1)  -- ALL, USING only: conversation_id IN (own conversations)
-- ---------------------------------------------------------------------------
ALTER POLICY "Users manage own messages" ON public.chat_messages
  USING ((conversation_id IN ( SELECT chat_conversations.id
     FROM chat_conversations
    WHERE (chat_conversations.user_id = (select auth.uid())))));

-- ---------------------------------------------------------------------------
-- personas  (1)  -- ALL, USING only: (user_id = auth.uid())
-- ---------------------------------------------------------------------------
ALTER POLICY "Users manage own personas" ON public.personas
  USING ((user_id = (select auth.uid())));

COMMIT;
