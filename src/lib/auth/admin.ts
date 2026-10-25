import { z } from "zod";
import type { createClient } from "@/lib/supabase/server";

/** Server-only allowlist. No default administrator and no credit/budget exemption. */
export function isAdminUser(userId: string | null | undefined): boolean {
  if (!userId || !z.uuid().safeParse(userId).success) return false;
  return (process.env.SMART_WRITER_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter((id) => z.uuid().safeParse(id).success)
    .includes(userId.toLowerCase());
}

export async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { kind: "unauthenticated" as const };
    if (!isAdminUser(user.id)) return { kind: "forbidden" as const };
    return { kind: "authorized" as const, userId: user.id };
  } catch {
    return { kind: "unauthenticated" as const };
  }
}
