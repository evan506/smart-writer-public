"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireProjectOwner,
  requireChapterOwner,
} from "@/lib/auth/ownership";
import {
  ConsistencyService,
  IndexingService,
  AIAnalysisService,
  checkLLMBudget,
  LLM_BUDGET_BLOCKED_MESSAGE,
} from "@/lib/services";
import type { AIAnalysisResult } from "@/types/ai-analysis";
import { z } from "zod";

const saveChapterSchema = z.object({
  chapterId: z.uuid(),
  projectId: z.uuid(),
  title: z.string().max(500).nullable(),
  content: z.string().max(500_000).nullable(),
});

export async function createChapter(formData: FormData) {
  const supabase = await createClient();

  const projectId = formData.get("projectId") as string;
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error, id: null };

  const title = (formData.get("title") as string) || null;
  const chapterNum = Number(formData.get("chapterNum"));

  const { data, error } = await supabase
    .from("chapters")
    .insert({
      project_id: projectId,
      title,
      chapter_num: chapterNum,
    })
    .select("id")
    .single();

  if (error) return { error: error.message, id: null };

  revalidatePath(`/projects/${projectId}/write`);
  return { error: null, id: data.id };
}

export async function saveChapter(
  chapterId: string,
  projectId: string,
  title: string | null,
  content: string | null,
  options?: { skipExtraction?: boolean }
): Promise<{ error: string | null; budgetBlocked?: boolean }> {
  const supabase = await createClient();

  const parsed = saveChapterSchema.safeParse({ chapterId, projectId, title, content });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const owner = await requireChapterOwner(supabase, chapterId);
  if (!owner.ok) return { error: owner.error };
  if (owner.projectId !== projectId) return { error: "권한이 없거나 존재하지 않는 챕터입니다" };

  const wordCount = content ? content.replace(/\s/g, "").length : 0;

  const { error } = await supabase
    .from("chapters")
    .update({ title, content, word_count: wordCount })
    .eq("id", chapterId);

  if (error) return { error: error.message };

  if (content && !options?.skipExtraction) {
    // Cost guard: the manuscript save above always succeeds; only the
    // LLM-backed background indexing/extraction is paused when over budget.
    const budget = await checkLLMBudget(supabase, {
      projectId,
      userId: owner.userId,
    });
    if (!budget.allowed) {
      revalidatePath(`/projects/${projectId}`);
      return { error: null, budgetBlocked: true };
    }
    after(async () => {
      const bgSupabase = await createClient();
      const indexer = new IndexingService(bgSupabase);
      await indexer.indexChapterWithExtraction(chapterId, projectId, content);
    });
  }

  revalidatePath(`/projects/${projectId}`);
  return { error: null, budgetBlocked: false };
}

export async function deleteChapter(chapterId: string, projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: chapter } = await supabase
    .from("chapters")
    .select("project_id")
    .eq("id", chapterId)
    .single();

  if (!chapter || chapter.project_id !== projectId) {
    return { error: "챕터를 찾을 수 없습니다" };
  }

  const { error } = await supabase
    .from("chapters")
    .delete()
    .eq("id", chapterId);

  if (error) return { error: error.message };

  revalidatePath(`/projects/${projectId}/write`);
  return { error: null };
}

export async function checkConsistency(chapterId: string) {
  const supabase = await createClient();

  const owner = await requireChapterOwner(supabase, chapterId);
  if (!owner.ok) return { error: owner.error, conflicts: [] };
  const service = new ConsistencyService(supabase);

  try {
    const conflicts = await service.detectConflicts(chapterId);
    return { error: null, conflicts };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "일관성 검사 실패",
      conflicts: [],
    };
  }
}

export async function analyzeChapter(
  chapterId: string,
  projectId: string,
  content: string
): Promise<{ error: string | null; result: AIAnalysisResult | null }> {
  const supabase = await createClient();

  const owner = await requireChapterOwner(supabase, chapterId);
  if (!owner.ok) return { error: owner.error, result: null };
  if (owner.projectId !== projectId) {
    return { error: "권한이 없거나 존재하지 않는 챕터입니다", result: null };
  }
  const budget = await checkLLMBudget(supabase, {
    projectId,
    userId: owner.userId,
  });
  if (!budget.allowed) {
    return { error: LLM_BUDGET_BLOCKED_MESSAGE, result: null };
  }

  const service = new AIAnalysisService(supabase);

  try {
    const result = await service.analyze(projectId, chapterId, content, {
      userId: owner.userId,
    });
    return { error: null, result };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "설정 확인 실패",
      result: null,
    };
  }
}
