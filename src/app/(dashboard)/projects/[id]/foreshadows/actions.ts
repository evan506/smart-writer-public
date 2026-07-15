"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProjectOwner } from "@/lib/auth/ownership";
import {
  getForeshadowRevalidationPaths,
  isForeshadowOwnedByProject,
  isForeshadowStatus,
  parseForeshadowFormData,
} from "@/lib/services/foreshadow-utils";
import type { ForeshadowStatus } from "@/types";

export async function createForeshadow(formData: FormData) {
  const parsed = parseForeshadowFormData(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { payload } = parsed;
  const projectId = payload.projectId;
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { error } = await supabase.from("foreshadows").insert({
    project_id: projectId,
    description: payload.description,
    planted_chapter: payload.plantedChapter,
    expected_reveal: payload.expectedReveal,
    entity_ids: payload.entityIds,
    status: "PLANTED",
  });

  if (error) return { error: error.message };

  getForeshadowRevalidationPaths(projectId).forEach((path) => revalidatePath(path));
  return { error: null };
}

export async function updateForeshadow(formData: FormData) {
  const parsed = parseForeshadowFormData(formData, {
    requireForeshadowId: true,
    requireStatus: true,
  });
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { payload } = parsed;
  const foreshadowId = payload.foreshadowId!;
  const projectId = payload.projectId;

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: existing } = await supabase
    .from("foreshadows")
    .select("project_id")
    .eq("id", foreshadowId)
    .single();
  if (!isForeshadowOwnedByProject(existing, projectId)) {
    return { error: "복선을 찾을 수 없습니다" };
  }

  const { error } = await supabase
    .from("foreshadows")
    .update({
      description: payload.description,
      planted_chapter: payload.plantedChapter,
      expected_reveal: payload.expectedReveal,
      status: payload.status,
      entity_ids: payload.entityIds,
    })
    .eq("id", foreshadowId);

  if (error) return { error: error.message };

  getForeshadowRevalidationPaths(projectId, foreshadowId).forEach((path) =>
    revalidatePath(path)
  );
  return { error: null };
}

export async function deleteForeshadow(foreshadowId: string, projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: foreshadow } = await supabase
    .from("foreshadows")
    .select("project_id")
    .eq("id", foreshadowId)
    .single();

  if (!isForeshadowOwnedByProject(foreshadow, projectId)) {
    return { error: "복선을 찾을 수 없습니다" };
  }

  const { error } = await supabase
    .from("foreshadows")
    .delete()
    .eq("id", foreshadowId);

  if (error) return { error: error.message };

  getForeshadowRevalidationPaths(projectId).forEach((path) => revalidatePath(path));
  return { error: null };
}

export async function updateForeshadowStatus(
  foreshadowId: string,
  projectId: string,
  status: ForeshadowStatus
) {
  if (!isForeshadowStatus(status)) {
    return { error: "복선 상태를 올바르게 선택하세요" };
  }

  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: existing } = await supabase
    .from("foreshadows")
    .select("project_id")
    .eq("id", foreshadowId)
    .single();
  if (!isForeshadowOwnedByProject(existing, projectId)) {
    return { error: "복선을 찾을 수 없습니다" };
  }

  const { error } = await supabase
    .from("foreshadows")
    .update({ status })
    .eq("id", foreshadowId);

  if (error) return { error: error.message };

  getForeshadowRevalidationPaths(projectId, foreshadowId).forEach((path) =>
    revalidatePath(path)
  );
  return { error: null };
}

export async function getForeshadowsForChapter(
  projectId: string,
  chapterNum: number
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) {
    return { planted: [], expected: [], unresolved: [] };
  }

  const [plantedRes, expectedRes, unresolvedRes] = await Promise.all([
    supabase
      .from("foreshadows")
      .select("*")
      .eq("project_id", projectId)
      .eq("planted_chapter", chapterNum)
      .order("created_at"),
    supabase
      .from("foreshadows")
      .select("*")
      .eq("project_id", projectId)
      .eq("expected_reveal", chapterNum)
      .order("created_at"),
    supabase
      .from("foreshadows")
      .select("*")
      .eq("project_id", projectId)
      .eq("status", "PLANTED")
      .lt("planted_chapter", chapterNum)
      .order("planted_chapter"),
  ]);

  return {
    planted: plantedRes.data ?? [],
    expected: expectedRes.data ?? [],
    unresolved: unresolvedRes.data ?? [],
  };
}
