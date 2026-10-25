"use server";

import { after } from "next/server";
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
  getLLMBudgetMessage,
} from "@/lib/services";
import type { AIAnalysisResult } from "@/types/ai-analysis";
import { z } from "zod";
import { createChapterSafely, createChapterSchema, type CreateChapterResult } from "@/lib/services/chapter-create";

const saveChapterSchema = z.object({
  chapterId: z.uuid(),
  projectId: z.uuid(),
  title: z.string().max(500).nullable(),
  content: z.string().max(500_000).nullable(),
});

// The workspace applies mutation results to its owned draft/chapter state.
// These pages read uncached data on entry; a Server Action revalidation can
// refresh an older chapter URL after the user has already started the next draft.
export async function createChapter(formData: FormData): Promise<CreateChapterResult> {
  const parsed = createChapterSchema.safeParse({
    projectId: formData.get("projectId"),
    requestId: formData.get("requestId"),
    title: formData.get("title"),
  });
  if (!parsed.success) {
    return { error: "챕터 생성 요청이 올바르지 않습니다.", id: null, chapter: null };
  }
  const supabase = await createClient();
  return createChapterSafely(supabase, parsed.data);
}

export async function saveChapter(
  chapterId: string,
  projectId: string,
  title: string | null,
  content: string | null,
  options?: { skipExtraction?: boolean }
): Promise<{ error: string | null; budgetBlocked?: boolean; budgetReason?: "unavailable" }> {
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
    try {
      const budget = await checkLLMBudget(supabase, {
        projectId,
        userId: owner.userId,
      });
      if (!budget.allowed) {
        return {
          error: null,
          budgetBlocked: true,
          ...(budget.reason === "unavailable" ? { budgetReason: "unavailable" as const } : {}),
        };
      }
      after(async () => {
        const bgSupabase = await createClient();
        const indexer = new IndexingService(bgSupabase);
        await indexer.indexChapterWithExtraction(chapterId, projectId, content, {
          userId: owner.userId,
        });
      });
    } catch (error) {
      console.error("[saveChapter] post-save AI scheduling failed:", error);
      return { error: null, budgetBlocked: true, budgetReason: "unavailable" };
    }
  }

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
    return { error: getLLMBudgetMessage(budget), result: null };
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
