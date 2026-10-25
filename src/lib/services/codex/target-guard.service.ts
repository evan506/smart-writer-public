import type { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/action-result";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const CODEX_TARGET_ERROR = "권한이 없거나 존재하지 않는 작품 기억 항목입니다";

export function isCodexTargetAccessError(error: string): boolean {
  return error === CODEX_TARGET_ERROR;
}

export async function requireCodexEntityTarget(
  supabase: SupabaseClient,
  entityId: string,
  projectId: string,
): Promise<ActionResult<{ name: string }>> {
  const { data: entity, error } = await supabase
    .from("entities")
    .select("project_id, name")
    .eq("id", entityId)
    .single();

  if (error) return { error: error.message };

  if (!entity || entity.project_id !== projectId) {
    return { error: "작품 기억 항목을 찾을 수 없습니다" };
  }

  return { error: null, name: entity.name };
}

export async function requireCodexEntityTargets(
  supabase: SupabaseClient,
  entityIds: string[],
  projectId: string,
): Promise<ActionResult> {
  const uniqueIds = [...new Set(entityIds)];
  const { data: entities, error } = await supabase
    .from("entities")
    .select("id, project_id")
    .in("id", uniqueIds);

  if (error) return { error: error.message };

  if (
    !entities ||
    entities.length !== uniqueIds.length ||
    entities.some((entity) => entity.project_id !== projectId)
  ) {
    return { error: CODEX_TARGET_ERROR };
  }

  return { error: null };
}

export async function requireCodexLinkTarget(
  supabase: SupabaseClient,
  linkId: string,
  projectId: string,
): Promise<ActionResult> {
  const { data: link, error } = await supabase
    .from("entity_links")
    .select("from_id, to_id")
    .eq("id", linkId)
    .single();

  if (error) return { error: error.message };
  if (!link) return { error: "관계를 찾을 수 없습니다" };

  const endpoints = await requireCodexEntityTargets(
    supabase,
    [link.from_id, link.to_id],
    projectId,
  );
  if (endpoints.error === CODEX_TARGET_ERROR) return { error: "권한이 없습니다" };
  if (endpoints.error) return endpoints;

  return { error: null };
}
