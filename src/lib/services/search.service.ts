import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  SearchEntitiesBm25Result,
  SearchChaptersBm25Result,
  MatchChunksResult,
} from "@/types";

export class SearchService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async searchEntitiesBm25(
    projectId: string,
    query: string,
    limit = 10
  ): Promise<SearchEntitiesBm25Result[]> {
    const { data, error } = await this.supabase.rpc("search_entities_bm25", {
      p_project_id: projectId,
      p_query: query,
      p_limit: limit,
    });

    if (error) throw error;
    return data ?? [];
  }

  async searchChaptersBm25(
    projectId: string,
    query: string,
    limit = 10
  ): Promise<SearchChaptersBm25Result[]> {
    const { data, error } = await this.supabase.rpc("search_chapters_bm25", {
      p_project_id: projectId,
      p_query: query,
      p_limit: limit,
    });

    if (error) throw error;
    return data ?? [];
  }

  async matchChunks(
    queryEmbedding: number[],
    options?: {
      projectId?: string;
      chunkTypes?: string[];
      matchCount?: number;
      matchThreshold?: number;
    }
  ): Promise<MatchChunksResult[]> {
    const { data, error } = await this.supabase.rpc("match_chunks", {
      query_embedding: JSON.stringify(queryEmbedding),
      p_project_id: options?.projectId,
      p_chunk_types: options?.chunkTypes,
      match_count: options?.matchCount ?? 10,
      match_threshold: options?.matchThreshold ?? 0.5,
    });

    if (error) throw error;
    return data ?? [];
  }
}
