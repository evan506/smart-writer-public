"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createGenreKit(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증이 필요합니다" };

  const name = formData.get("name") as string;
  const genreType = formData.get("genre_type") as string;
  const rulesRaw = formData.get("rules") as string;
  const isPublic = formData.get("is_public") === "true";

  let rules;
  try {
    rules = JSON.parse(rulesRaw);
  } catch {
    return { error: "규칙 데이터가 올바르지 않습니다" };
  }

  // Per-user uniqueness: a user may have at most one custom kit per genre_type.
  // Global kits (user_id IS NULL) are unaffected.
  const { count } = await supabase
    .from("genre_kits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("genre_type", genreType);

  if (count && count > 0) {
    return { error: "이미 동일한 장르 분류의 내 장르 킷이 존재합니다" };
  }

  const { error } = await supabase.from("genre_kits").insert({
    name,
    genre_type: genreType,
    rules,
    user_id: user.id,
    is_public: isPublic,
  });

  if (error) {
    if (error.code === "23505") {
      return { error: "이미 동일한 장르 분류의 내 장르 킷이 존재합니다" };
    }
    return { error: error.message };
  }

  revalidatePath("/genre-kits");
  return { error: null };
}

export async function updateGenreKit(formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증이 필요합니다" };

  const kitId = formData.get("kitId") as string;
  const name = formData.get("name") as string;
  const genreType = formData.get("genre_type") as string;
  const rulesRaw = formData.get("rules") as string;
  const isPublic = formData.get("is_public") === "true";

  let rules;
  try {
    rules = JSON.parse(rulesRaw);
  } catch {
    return { error: "규칙 데이터가 올바르지 않습니다" };
  }

  // Ownership check (RLS also enforces, but give a friendly Korean message).
  const { data: existing } = await supabase
    .from("genre_kits")
    .select("user_id")
    .eq("id", kitId)
    .single();

  if (!existing) return { error: "장르 킷을 찾을 수 없습니다" };
  if (existing.user_id !== user.id) {
    return { error: "공용 장르 킷은 수정할 수 없습니다" };
  }

  const { error } = await supabase
    .from("genre_kits")
    .update({ name, genre_type: genreType, rules, is_public: isPublic })
    .eq("id", kitId)
    .eq("user_id", user.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "이미 동일한 장르 분류의 내 장르 킷이 존재합니다" };
    }
    return { error: error.message };
  }

  revalidatePath("/genre-kits");
  revalidatePath(`/genre-kits/${kitId}`);
  return { error: null };
}

export async function deleteGenreKit(kitId: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증이 필요합니다" };

  // Ownership check (RLS also enforces, but give a friendly Korean message).
  const { data: existing } = await supabase
    .from("genre_kits")
    .select("user_id")
    .eq("id", kitId)
    .single();

  if (!existing) return { error: "장르 킷을 찾을 수 없습니다" };
  if (existing.user_id !== user.id) {
    return { error: "공용 장르 킷은 삭제할 수 없습니다" };
  }

  const { error } = await supabase
    .from("genre_kits")
    .delete()
    .eq("id", kitId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/genre-kits");
  return { error: null };
}
