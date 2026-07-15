import { createClient } from "@/lib/supabase/server";
import type { LinkDirection } from "@/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type CodexEntityLinkMutationInput = {
  fromId: string;
  toId: string;
  relationType: string;
  direction: LinkDirection;
  weight: number;
};

export async function createCodexEntityLink(
  supabase: SupabaseClient,
  input: CodexEntityLinkMutationInput
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("entity_links").insert({
    from_id: input.fromId,
    to_id: input.toId,
    relation_type: input.relationType,
    direction: input.direction,
    weight: input.weight,
  });

  if (error) {
    // entity_links_from_to_rel_unique (from_id,to_id,relation_type)
    if (error.code === "23505") {
      return { error: "이미 등록된 관계입니다" };
    }
    return { error: error.message };
  }

  return { error: null };
}

export async function updateCodexEntityLink(
  supabase: SupabaseClient,
  linkId: string,
  relationType: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("entity_links")
    .update({ relation_type: relationType })
    .eq("id", linkId);

  if (error) return { error: error.message };
  return { error: null };
}

export async function deleteCodexEntityLink(
  supabase: SupabaseClient,
  linkId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("entity_links")
    .delete()
    .eq("id", linkId);

  if (error) return { error: error.message };
  return { error: null };
}
