"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireProjectOwner } from "@/lib/auth/ownership";
import { isPlotThreadRowKind } from "@/lib/planning/plot-thread-constants";

const projectIdSchema = z.uuid();
const idSchema = z.uuid();

const createThreadSchema = z.object({
  projectId: projectIdSchema,
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).nullable(),
});

const updateThreadSchema = z.object({
  projectId: projectIdSchema,
  threadId: idSchema,
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).nullable(),
});

const deleteThreadSchema = z.object({
  projectId: projectIdSchema,
  threadId: idSchema,
});

const threadBlockSchema = z.object({
  projectId: projectIdSchema,
  threadId: idSchema,
  planningBlockId: idSchema,
});

const threadChapterSchema = z.object({
  projectId: projectIdSchema,
  threadId: idSchema,
  chapterId: idSchema,
});

function planningPath(projectId: string) {
  return `/projects/${projectId}/planning`;
}

function normalizeNullableText(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function isUniqueViolation(error: { code?: string }) {
  return error.code === "23505";
}

function formatStorageError(error: { code?: string; message: string }) {
  if (
    error.code === "PGRST205" ||
    (error.message.includes("plot_thread") &&
      error.message.includes("schema cache"))
  ) {
    return "플롯 스레드 데이터베이스가 아직 준비되지 않았습니다. Supabase에 20260621120000_v3_3_plot_threads migration을 적용한 뒤 다시 시도해주세요.";
  }
  return error.message;
}

async function requireThreadInProject(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  threadId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("plot_threads")
    .select("id")
    .eq("id", threadId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return { ok: false, error: formatStorageError(error) };
  if (!data) return { ok: false, error: "플롯 스레드를 찾을 수 없습니다" };
  return { ok: true };
}

export async function createPlotThread(input: {
  projectId: string;
  title: string;
  summary: string | null;
}) {
  const parsed = createThreadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message, id: null };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error, id: null };

  const { data: lastThread } = await supabase
    .from("plot_threads")
    .select("position")
    .eq("project_id", parsed.data.projectId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition =
    typeof lastThread?.position === "number" ? lastThread.position + 1 : 0;

  const { data, error } = await supabase
    .from("plot_threads")
    .insert({
      project_id: parsed.data.projectId,
      title: parsed.data.title,
      summary: normalizeNullableText(parsed.data.summary),
      position: nextPosition,
    })
    .select("id")
    .single();

  if (error) return { error: formatStorageError(error), id: null };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null, id: data.id as string };
}

export async function updatePlotThread(input: {
  projectId: string;
  threadId: string;
  title: string;
  summary: string | null;
}) {
  const parsed = updateThreadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { data, error } = await supabase
    .from("plot_threads")
    .update({
      title: parsed.data.title,
      summary: normalizeNullableText(parsed.data.summary),
    })
    .eq("id", parsed.data.threadId)
    .eq("project_id", parsed.data.projectId)
    .select("id")
    .maybeSingle();

  if (error) return { error: formatStorageError(error) };
  if (!data) return { error: "플롯 스레드를 찾을 수 없습니다" };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function deletePlotThread(input: {
  projectId: string;
  threadId: string;
}) {
  const parsed = deleteThreadSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { error } = await supabase
    .from("plot_threads")
    .delete()
    .eq("id", parsed.data.threadId)
    .eq("project_id", parsed.data.projectId);

  if (error) return { error: formatStorageError(error) };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function linkThreadToPlanningBlock(input: {
  projectId: string;
  threadId: string;
  planningBlockId: string;
}) {
  const parsed = threadBlockSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const thread = await requireThreadInProject(
    supabase,
    parsed.data.projectId,
    parsed.data.threadId
  );
  if (!thread.ok) return { error: thread.error };

  const { data: block, error: blockError } = await supabase
    .from("planning_blocks")
    .select("id, kind")
    .eq("id", parsed.data.planningBlockId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();

  if (blockError) return { error: formatStorageError(blockError) };
  if (!block) return { error: "연결할 구상 카드를 찾을 수 없습니다" };
  if (!isPlotThreadRowKind(block.kind)) {
    return {
      error:
        "에피소드 · 화 · 장면 · 사건 · 작품 약속 카드만 플롯 스레드에 연결할 수 있습니다",
    };
  }

  const { data: lastRow } = await supabase
    .from("plot_thread_planning_blocks")
    .select("position")
    .eq("project_id", parsed.data.projectId)
    .eq("plot_thread_id", parsed.data.threadId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition =
    typeof lastRow?.position === "number" ? lastRow.position + 1 : 0;

  const { error: insertError } = await supabase
    .from("plot_thread_planning_blocks")
    .insert({
      project_id: parsed.data.projectId,
      plot_thread_id: parsed.data.threadId,
      planning_block_id: parsed.data.planningBlockId,
      position: nextPosition,
    });

  if (insertError && !isUniqueViolation(insertError)) {
    return { error: formatStorageError(insertError) };
  }

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function unlinkThreadFromPlanningBlock(input: {
  projectId: string;
  threadId: string;
  planningBlockId: string;
}) {
  const parsed = threadBlockSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { error } = await supabase
    .from("plot_thread_planning_blocks")
    .delete()
    .eq("project_id", parsed.data.projectId)
    .eq("plot_thread_id", parsed.data.threadId)
    .eq("planning_block_id", parsed.data.planningBlockId);

  if (error) return { error: formatStorageError(error) };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function linkThreadToChapter(input: {
  projectId: string;
  threadId: string;
  chapterId: string;
}) {
  const parsed = threadChapterSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const thread = await requireThreadInProject(
    supabase,
    parsed.data.projectId,
    parsed.data.threadId
  );
  if (!thread.ok) return { error: thread.error };

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .select("id")
    .eq("id", parsed.data.chapterId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();

  if (chapterError) return { error: chapterError.message };
  if (!chapter) return { error: "연결할 회차를 찾을 수 없습니다" };

  const { error: insertError } = await supabase
    .from("plot_thread_chapters")
    .insert({
      project_id: parsed.data.projectId,
      plot_thread_id: parsed.data.threadId,
      chapter_id: parsed.data.chapterId,
    });

  if (insertError && !isUniqueViolation(insertError)) {
    return { error: formatStorageError(insertError) };
  }

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function unlinkThreadFromChapter(input: {
  projectId: string;
  threadId: string;
  chapterId: string;
}) {
  const parsed = threadChapterSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { error } = await supabase
    .from("plot_thread_chapters")
    .delete()
    .eq("project_id", parsed.data.projectId)
    .eq("plot_thread_id", parsed.data.threadId)
    .eq("chapter_id", parsed.data.chapterId);

  if (error) return { error: formatStorageError(error) };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}
