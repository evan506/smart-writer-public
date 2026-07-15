"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const createProjectSchema = z.object({
  title: z.string().min(1, "제목을 입력하세요").max(200),
  genre: z.string().max(100).nullable(),
  description: z.string().max(2000).nullable(),
});

export async function createProject(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "인증이 필요합니다" };

  const parsed = createProjectSchema.safeParse({
    title: formData.get("title"),
    genre: (formData.get("genre") as string) || null,
    description: (formData.get("description") as string) || null,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { title, genre, description } = parsed.data;

  const { error } = await supabase.from("projects").insert({
    user_id: user.id,
    title,
    genre,
    description,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/projects");
  return { error: null };
}

export async function deleteProject(projectId: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "인증이 필요합니다" };

  // 소유권 확인 후 삭제 (cascade: chapters, entities, entity_links, mentions, entity_suggestions, foreshadows, rag_logs)
  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/projects");
  return { error: null };
}
