import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { DetectConflictsResult } from "@/types";

export class ConsistencyService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async detectConflicts(
    chapterId: string
  ): Promise<DetectConflictsResult[]> {
    const { data, error } = await this.supabase.rpc("detect_conflicts", {
      p_chapter_id: chapterId,
    });

    if (error) throw error;
    return data ?? [];
  }
}
