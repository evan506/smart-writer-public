import {
  listApprovedCodexFactsByEntity,
  type CodexFact,
} from "@/lib/services/canon-facts/read.service";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface PlanningLinkedEntity {
  id: string;
  name: string;
  type: string;
  summary: string | null;
}

export interface PlanningEntityLink {
  id: string;
  planning_block_id: string;
  target_id: string;
}

export interface PlanningMemoryContext {
  availableEntities: PlanningLinkedEntity[];
  entityLinks: PlanningEntityLink[];
  linkedEntities: PlanningLinkedEntity[];
  factsByEntityId: Record<string, CodexFact[]>;
}

type PlanningReadError = {
  message: string;
};

type EntityRow = PlanningLinkedEntity & {
  project_id: string;
};

type PlanningLinkRow = PlanningEntityLink;

export async function getPlanningMemoryContext(
  supabase: SupabaseClient,
  projectId: string
): Promise<PlanningMemoryContext> {
  const [
    { data: entities, error: entitiesError },
    { data: links, error: linksError },
  ] = await Promise.all([
    supabase
      .from("entities")
      .select("id, name, type, summary, project_id")
      .eq("project_id", projectId)
      .order("type")
      .order("name"),
    supabase
      .from("planning_links")
      .select("id, planning_block_id, target_id")
      .eq("project_id", projectId)
      .eq("target_type", "entity")
      .eq("link_kind", "MEMORY_LINKED"),
  ]);

  if (entitiesError) {
    throwPlanningMemoryReadError("작품 기억", entitiesError);
  }
  if (linksError) {
    throwPlanningMemoryReadError("구상 연결", linksError);
  }

  const entityRows = ((entities ?? []) as EntityRow[]).map((entity) => ({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    summary: entity.summary,
  }));
  const entityById = new Map(entityRows.map((entity) => [entity.id, entity]));
  const entityLinks = ((links ?? []) as PlanningLinkRow[]).filter((link) =>
    entityById.has(link.target_id)
  );
  const linkedEntityIds = Array.from(
    new Set(entityLinks.map((link) => link.target_id))
  );
  const linkedEntities = linkedEntityIds
    .map((entityId) => entityById.get(entityId))
    .filter((entity): entity is PlanningLinkedEntity => Boolean(entity));
  const factsByEntityId = await listApprovedCodexFactsByEntity(
    supabase,
    projectId,
    linkedEntityIds
  );

  return {
    availableEntities: entityRows,
    entityLinks,
    linkedEntities,
    factsByEntityId,
  };
}

function throwPlanningMemoryReadError(
  label: string,
  error: PlanningReadError
): never {
  throw new Error(`${label} 정보를 불러오지 못했습니다: ${error.message}`);
}
