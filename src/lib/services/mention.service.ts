import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

export interface MentionResult {
  entityId: string;
  chunkId: string;
  count: number;
}

export class MentionService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async extractMentions(
    projectId: string,
    chunks: { id: string; content: string }[]
  ): Promise<MentionResult[]> {
    // Load all entities for this project
    const { data: entities, error } = await this.supabase
      .from("entities")
      .select("id, name, aliases")
      .eq("project_id", projectId);

    if (error) throw error;
    if (!entities || entities.length === 0) return [];

    // Build search terms: [{ entityId, term }]
    const searchTerms: { entityId: string; term: string }[] = [];
    for (const entity of entities) {
      if (entity.name && entity.name.length >= 2) {
        searchTerms.push({ entityId: entity.id, term: entity.name });
      }
      const aliases = entity.aliases as string[] | null;
      if (aliases) {
        for (const alias of aliases) {
          if (alias && alias.length >= 2) {
            searchTerms.push({ entityId: entity.id, term: alias });
          }
        }
      }
    }

    if (searchTerms.length === 0) return [];

    const results: MentionResult[] = [];

    for (const chunk of chunks) {
      const entityCounts = new Map<string, number>();

      for (const { entityId, term } of searchTerms) {
        const regex = new RegExp(escapeRegex(term), "g");
        const matches = chunk.content.match(regex);
        if (matches && matches.length > 0) {
          const prev = entityCounts.get(entityId) ?? 0;
          entityCounts.set(entityId, prev + matches.length);
        }
      }

      for (const [entityId, count] of entityCounts) {
        results.push({ entityId, chunkId: chunk.id, count });
      }
    }

    return results;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
