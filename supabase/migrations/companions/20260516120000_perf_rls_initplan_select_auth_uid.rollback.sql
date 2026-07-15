-- Rollback for: 20260516120000_perf_rls_initplan_select_auth_uid.sql
--
-- Reverts every policy back to its EXACT pre-migration predicate: bare
-- `auth.uid()` (per-row re-evaluation). Restores the live-DB form captured via
-- catalog introspection at authoring time (project REDACTED-SUPABASE-PROJECT-REF,
-- 2026-05-16). Name / command / roles / permissive and the presence/absence of
-- WITH CHECK are all preserved (ALTER POLICY, never DROP/CREATE).
--
-- This re-introduces the `auth_rls_initplan` performance advisor warnings; it
-- exists only so the change is fully reversible. genre_kits / analysis_jobs
-- were never touched by the forward migration and are not touched here.

BEGIN;

-- projects (4)
ALTER POLICY "Users can delete own projects" ON public.projects
  USING ((auth.uid() = user_id));
ALTER POLICY "Users can insert own projects" ON public.projects
  WITH CHECK ((auth.uid() = user_id));
ALTER POLICY "Users can update own projects" ON public.projects
  USING ((auth.uid() = user_id))
  WITH CHECK ((auth.uid() = user_id));
ALTER POLICY "Users can view own projects" ON public.projects
  USING ((auth.uid() = user_id));

-- chapters (4)
ALTER POLICY "Users can delete chapters in own projects" ON public.chapters
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can insert chapters in own projects" ON public.chapters
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can update chapters in own projects" ON public.chapters
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))))
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can view chapters in own projects" ON public.chapters
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));

-- entities (4)
ALTER POLICY "Users can delete entities in own projects" ON public.entities
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can insert entities in own projects" ON public.entities
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can update entities in own projects" ON public.entities
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))))
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can view entities in own projects" ON public.entities
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));

-- entity_suggestions (4) — UPDATE has USING only (no WITH CHECK), preserved.
ALTER POLICY "Users can delete suggestions for their projects" ON public.entity_suggestions
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can insert suggestions for their projects" ON public.entity_suggestions
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can update suggestions for their projects" ON public.entity_suggestions
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can view suggestions for their projects" ON public.entity_suggestions
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));

-- foreshadows (4)
ALTER POLICY "Users can delete foreshadows in own projects" ON public.foreshadows
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can insert foreshadows in own projects" ON public.foreshadows
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can update foreshadows in own projects" ON public.foreshadows
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))))
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can view foreshadows in own projects" ON public.foreshadows
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));

-- rag_logs (2)
ALTER POLICY "Users can insert rag logs in own projects" ON public.rag_logs
  WITH CHECK ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));
ALTER POLICY "Users can view rag logs in own projects" ON public.rag_logs
  USING ((project_id IN ( SELECT projects.id
     FROM projects
    WHERE (projects.user_id = auth.uid()))));

-- chunks (4)
ALTER POLICY "Users can delete chunks in own projects" ON public.chunks
  USING ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))));
ALTER POLICY "Users can insert chunks in own projects" ON public.chunks
  WITH CHECK ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))));
ALTER POLICY "Users can update chunks in own projects" ON public.chunks
  USING ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))))
  WITH CHECK ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))));
ALTER POLICY "Users can view chunks in own projects" ON public.chunks
  USING ((chapter_id IN ( SELECT chapters.id
     FROM chapters
    WHERE (chapters.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))));

-- entity_links (4)
ALTER POLICY "Users can delete own entity links" ON public.entity_links
  USING ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))));
ALTER POLICY "Users can insert own entity links" ON public.entity_links
  WITH CHECK ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))));
ALTER POLICY "Users can update own entity links" ON public.entity_links
  USING ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))))
  WITH CHECK ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))));
ALTER POLICY "Users can view own entity links" ON public.entity_links
  USING ((from_id IN ( SELECT entities.id
     FROM entities
    WHERE (entities.project_id IN ( SELECT projects.id
             FROM projects
            WHERE (projects.user_id = auth.uid()))))));

-- mentions (4)
ALTER POLICY "Users can delete mentions in own projects" ON public.mentions
  USING ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = auth.uid()))))))));
ALTER POLICY "Users can insert mentions in own projects" ON public.mentions
  WITH CHECK ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = auth.uid()))))))));
ALTER POLICY "Users can update mentions in own projects" ON public.mentions
  USING ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = auth.uid()))))))))
  WITH CHECK ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = auth.uid()))))))));
ALTER POLICY "Users can view mentions in own projects" ON public.mentions
  USING ((chunk_id IN ( SELECT chunks.id
     FROM chunks
    WHERE (chunks.chapter_id IN ( SELECT chapters.id
             FROM chapters
            WHERE (chapters.project_id IN ( SELECT projects.id
                     FROM projects
                    WHERE (projects.user_id = auth.uid()))))))));

-- chat_conversations (1) — ALL, USING only
ALTER POLICY "Users manage own conversations" ON public.chat_conversations
  USING ((user_id = auth.uid()));

-- chat_messages (1) — ALL, USING only
ALTER POLICY "Users manage own messages" ON public.chat_messages
  USING ((conversation_id IN ( SELECT chat_conversations.id
     FROM chat_conversations
    WHERE (chat_conversations.user_id = auth.uid()))));

-- personas (1) — ALL, USING only
ALTER POLICY "Users manage own personas" ON public.personas
  USING ((user_id = auth.uid()));

COMMIT;
