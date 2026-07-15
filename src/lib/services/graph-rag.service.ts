import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  FindRelatedEntitiesResult,
  CheckRelationshipResult,
  GetEntityContextResult,
} from "@/types";

export class GraphRAGService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async findRelatedEntities(
    entityId: string,
    maxDepth = 3
  ): Promise<FindRelatedEntitiesResult[]> {
    const { data, error } = await this.supabase.rpc("find_related_entities", {
      target_entity_id: entityId,
      max_depth: maxDepth,
    });

    if (error) throw error;
    return data ?? [];
  }

  async checkRelationship(
    entityA: string,
    entityB: string
  ): Promise<CheckRelationshipResult[]> {
    const { data, error } = await this.supabase.rpc("check_relationship", {
      entity_a: entityA,
      entity_b: entityB,
    });

    if (error) throw error;
    return data ?? [];
  }

  async getEntityContext(
    entityId: string
  ): Promise<GetEntityContextResult[]> {
    const { data, error } = await this.supabase.rpc("get_entity_context", {
      target_entity_id: entityId,
    });

    if (error) throw error;
    return data ?? [];
  }
}
