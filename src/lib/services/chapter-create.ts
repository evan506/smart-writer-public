import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireProjectOwner } from "@/lib/auth/ownership";
import type { Chapter } from "@/types";
import type { Database } from "@/types/database.types";

export const createChapterSchema = z.object({
  projectId: z.uuid(),
  requestId: z.uuid(),
  title: z.string().max(500).nullable(),
});

export type CreateChapterInput = z.infer<typeof createChapterSchema>;
export type CreateChapterResult =
  | { error: null; id: string; chapter: Chapter }
  | { error: string; id: null; chapter: null };

export const CHAPTER_CREATE_ERROR = "챕터를 만들지 못했습니다. 다시 눌러 재시도해 주세요.";

function failed(error: string): CreateChapterResult {
  return { error, id: null, chapter: null };
}

/** The request UUID is also the row ID, so an ambiguous response can be retried safely. */
export async function createChapterSafely(
  supabase: SupabaseClient<Database>,
  input: CreateChapterInput,
): Promise<CreateChapterResult> {
  const parsed = createChapterSchema.safeParse(input);
  if (!parsed.success) return failed("챕터 생성 요청이 올바르지 않습니다.");
  const { projectId, requestId, title } = parsed.data;
  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return failed(owner.error);

  const findExisting = () => supabase.from("chapters").select("*")
    .eq("project_id", projectId).eq("id", requestId).maybeSingle();
  const existing = await findExisting();
  if (existing.error) return failed(CHAPTER_CREATE_ERROR);
  if (existing.data) return { error: null, id: existing.data.id, chapter: existing.data };

  // The existing unique(project_id, chapter_num) index arbitrates concurrent allocation.
  // Only uniqueness races retry; network/auth/other errors remain explicit retryable failures.
  for (let attempt = 0; attempt < 8; attempt++) {
    const latest = await supabase.from("chapters").select("chapter_num")
      .eq("project_id", projectId).order("chapter_num", { ascending: false }).limit(1).maybeSingle();
    if (latest.error) return failed(CHAPTER_CREATE_ERROR);
    const { data, error } = await supabase.from("chapters").insert({
      id: requestId,
      project_id: projectId,
      chapter_num: (latest.data?.chapter_num ?? 0) + 1,
      title: title || null,
    }).select("*").single();
    if (!error && data) return { error: null, id: data.id, chapter: data };
    if (error?.code !== "23505") return failed(CHAPTER_CREATE_ERROR);
    const recovered = await findExisting();
    if (recovered.error) return failed(CHAPTER_CREATE_ERROR);
    if (recovered.data) return { error: null, id: recovered.data.id, chapter: recovered.data };
  }
  return failed("다른 챕터가 생성 중입니다. 잠시 후 다시 눌러 주세요.");
}
