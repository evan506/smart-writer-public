"use server";

import { createClient } from "@/lib/supabase/server";
import { requireProjectOwner } from "@/lib/auth/ownership";
import {
  CanonQAService,
  RAGSearchService,
  checkLLMBudget,
  LLM_BUDGET_BLOCKED_MESSAGE,
} from "@/lib/services";
import type { CanonQAResult } from "@/lib/services/canon-qna.service";
import type { RAGSearchResult } from "@/lib/services/rag-search.service";

export async function ragSearch(
  projectId: string,
  query: string
): Promise<{ error: string | null; result: RAGSearchResult | null }> {
  if (!query.trim()) {
    return { error: "검색어를 입력해주세요.", result: null };
  }

  try {
    const supabase = await createClient();
    const owner = await requireProjectOwner(supabase, projectId);
    if (!owner.ok) return { error: owner.error, result: null };
    const service = new RAGSearchService(supabase);
    const result = await service.search(projectId, query);
    return { error: null, result };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.",
      result: null,
    };
  }
}

export async function askCanonQuestion(
  projectId: string,
  question: string
): Promise<{ error: string | null; result: CanonQAResult | null }> {
  if (!question.trim()) {
    return { error: "질문을 입력해주세요.", result: null };
  }

  try {
    const supabase = await createClient();
    const owner = await requireProjectOwner(supabase, projectId);
    if (!owner.ok) return { error: owner.error, result: null };

    const budget = await checkLLMBudget(supabase, {
      projectId,
      userId: owner.userId,
    });
    if (!budget.allowed) {
      return { error: LLM_BUDGET_BLOCKED_MESSAGE, result: null };
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const service = new CanonQAService(supabase);
    const result = await service.ask({
      projectId,
      question,
      userId: user?.id ?? null,
    });
    return { error: null, result };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "작품 기억 답변 중 오류가 발생했습니다.",
      result: null,
    };
  }
}
