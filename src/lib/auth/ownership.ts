// Server-action ownership guards.
//
// RLS on the remote DB already isolates rows per user (every policy is
// `project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())` or
// `user_id = auth.uid()`). These helpers add an explicit server-action-level
// defence line on top of RLS so a route/form-supplied projectId/chapterId is
// proven to belong to the caller BEFORE any read or mutation — failing fast
// with a friendly Korean message instead of relying on RLS alone (a single
// mis-scoped policy would otherwise silently leak/allow).
//
// Used by all (dashboard)/projects/[id]/* server actions.

import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type OwnerOk = { ok: true; userId: string };
export type OwnerFail = { ok: false; error: string };
export type OwnerResult = OwnerOk | OwnerFail;

export type ChapterOwnerOk = { ok: true; userId: string; projectId: string };
export type ChapterOwnerResult = ChapterOwnerOk | OwnerFail;

const MSG_AUTH = "인증이 필요합니다";
const MSG_PROJECT = "권한이 없거나 존재하지 않는 프로젝트입니다";
const MSG_CHAPTER = "권한이 없거나 존재하지 않는 챕터입니다";

/** Require an authenticated user. */
export async function requireUser(
  supabase: SupabaseServerClient
): Promise<OwnerResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: MSG_AUTH };
  return { ok: true, userId: user.id };
}

/**
 * Require that `projectId` exists AND belongs to the authenticated user.
 * The `.eq("user_id", …)` makes this independent of RLS being correct.
 */
export async function requireProjectOwner(
  supabase: SupabaseServerClient,
  projectId: string
): Promise<OwnerResult> {
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth;

  if (!projectId) return { ok: false, error: MSG_PROJECT };

  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: MSG_PROJECT };
  return { ok: true, userId: auth.userId };
}

/**
 * Require that `chapterId` belongs to a project owned by the caller.
 * Returns the resolved `projectId` so callers can also assert a
 * separately-supplied projectId matches (cross-project guard).
 */
export async function requireChapterOwner(
  supabase: SupabaseServerClient,
  chapterId: string
): Promise<ChapterOwnerResult> {
  const auth = await requireUser(supabase);
  if (!auth.ok) return auth;

  if (!chapterId) return { ok: false, error: MSG_CHAPTER };

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapterId)
    .maybeSingle();

  if (!chapter?.project_id) return { ok: false, error: MSG_CHAPTER };

  const owner = await requireProjectOwner(supabase, chapter.project_id);
  if (!owner.ok) return { ok: false, error: MSG_CHAPTER };

  return { ok: true, userId: auth.userId, projectId: chapter.project_id };
}
