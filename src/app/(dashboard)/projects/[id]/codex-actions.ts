"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProjectOwner } from "@/lib/auth/ownership";
import {
  emptyCodexData,
  getCodexDataForProject,
} from "@/lib/services/codex/read.service";
import {
  createCodexEntity,
  scheduleEntityEmbedding,
  deleteCodexEntity,
  mergeCodexEntityAsAlias,
  updateCodexEntity,
} from "@/lib/services/codex/entity-mutation.service";
import {
  createCodexEntityLink,
  deleteCodexEntityLink,
  updateCodexEntityLink,
} from "@/lib/services/codex/link-mutation.service";
import {
  requireCodexEntityTarget,
  requireCodexEntityTargets,
  requireCodexLinkTarget,
  isCodexTargetAccessError,
} from "@/lib/services/codex/target-guard.service";
import {
  parseCreateEntityForm,
  parseCreateEntityLinkForm,
  parseEntityLinkDeleteInput,
  parseEntityLinkUpdateInput,
  parseEntityMutationIds,
  parseUpdateEntityInlineInput,
  parseUpdateEntityForm,
  projectCodexPath,
} from "./codex-action-forms";

// ── Helpers ──────────────────────────────────────────────────────────────

function buildNameToIdsMap(entities: { id: string; name: string }[]) {
  const map = new Map<string, string[]>();
  for (const e of entities) {
    const key = e.name.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(e.id);
  }
  return map;
}

// ── Sidebar Stats (lightweight) ───────────────────────────────────────────

const EMPTY_SIDEBAR_STATS = {
  projectTitle: "",
  projectGenre: null as string | null,
  entityCount: 0,
  confirmedCount: 0,
  reviewCount: 0,
  relationCount: 0,
};

export async function getCodexSidebarStats(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return EMPTY_SIDEBAR_STATS;

  const [{ data: project }, { data: entitiesData }, { data: pendingRows }] =
    await Promise.all([
      supabase
        .from("projects")
        .select("title, genre")
        .eq("id", projectId)
        .single(),
      supabase
        .from("entities")
        .select("id, name")
        .eq("project_id", projectId),
      supabase
        .from("entity_suggestions")
        .select("name, matched_entity_id")
        .eq("project_id", projectId)
        .eq("status", "PENDING")
        .neq("type", "RELATION"),
    ]);

  const entities = entitiesData ?? [];
  const ids = entities.map((e) => e.id);

  // Count unique entities with pending suggestions (by ID or name match)
  const reviewEntityIds = new Set<string>();
  if (pendingRows && pendingRows.length > 0) {
    const nameToIds = buildNameToIdsMap(entities);
    for (const row of pendingRows) {
      if (row.matched_entity_id) {
        reviewEntityIds.add(row.matched_entity_id);
      } else if (row.name) {
        const matched = nameToIds.get(row.name.toLowerCase());
        if (matched) matched.forEach((id) => reviewEntityIds.add(id));
      }
    }
  }

  let relationCount = 0;
  if (ids.length > 0) {
    const { count } = await supabase
      .from("entity_links")
      .select("id", { count: "exact", head: true })
      .or(`from_id.in.(${ids.join(",")}),to_id.in.(${ids.join(",")})`);
    relationCount = count ?? 0;
  }

  // Also count unmatched (CREATE) suggestions
  let unmatchedCount = 0;
  if (pendingRows && pendingRows.length > 0) {
    const nameToIds = buildNameToIdsMap(entities);
    for (const row of pendingRows) {
      const hasIdMatch = row.matched_entity_id && ids.includes(row.matched_entity_id);
      const hasNameMatch = row.name && nameToIds.has(row.name.toLowerCase());
      if (!hasIdMatch && !hasNameMatch) unmatchedCount++;
    }
  }

  const total = ids.length;
  const review = reviewEntityIds.size;

  return {
    projectTitle: project?.title ?? "",
    projectGenre: (project as Record<string, unknown>)?.genre as string | null ?? null,
    entityCount: total,
    confirmedCount: total - review,
    reviewCount: review + unmatchedCount,
    relationCount,
  };
}

// ── Read ──────────────────────────────────────────────────────────────────

export async function getEntityHighlightData(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) {
    return {
      error: owner.error,
      entities: [] as { id: string; name: string; type: string; aliases: string[]; summary: string | null }[],
    };
  }

  const { data: entities, error } = await supabase
    .from("entities")
    .select("id, name, type, aliases, summary")
    .eq("project_id", projectId);

  if (error || !entities) {
    return {
      error: error?.message ?? "조회 실패",
      entities: [] as { id: string; name: string; type: string; aliases: string[]; summary: string | null }[],
    };
  }

  return {
    error: null,
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      aliases: Array.isArray(e.aliases) ? (e.aliases as string[]) : [],
      summary: e.summary,
    })),
  };
}

export async function getCodexData(projectId: string) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return emptyCodexData(owner.error);
  return getCodexDataForProject(supabase, projectId);
}

// ── Inline update (from codex panel) ─────────────────────────────────────

export async function updateEntityInline(
  entityId: string,
  projectId: string,
  fields: Partial<{
    name: string;
    type: string;
    summary: string | null;
    aliases: string[] | null;
  }>
) {
  const parsed = parseUpdateEntityInlineInput(entityId, projectId, fields);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: entity } = await supabase
    .from("entities")
    .select("project_id")
    .eq("id", entityId)
    .single();

  if (!entity || entity.project_id !== projectId) {
    return { error: "작품 기억 항목을 찾을 수 없습니다" };
  }

  const { error } = await supabase
    .from("entities")
    .update(parsed.data.fields)
    .eq("id", entityId);

  if (error) return { error: error.message };

  if (
    parsed.data.fields.name ||
    parsed.data.fields.summary !== undefined ||
    parsed.data.fields.aliases !== undefined
  ) {
    const { data: full } = await supabase
      .from("entities")
      .select("name, summary, aliases")
      .eq("id", entityId)
      .single();

    if (full) {
      scheduleEntityEmbedding(entityId, projectId, owner.userId, {
        name: full.name,
        summary: full.summary,
        aliases: Array.isArray(full.aliases) ? (full.aliases as string[]) : [],
      });
    }
  }

  return { error: null };
}

export async function removeEntityAlias(
  entityId: string,
  projectId: string,
  alias: string
) {
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const normalizedAlias = alias.trim();
  if (!normalizedAlias) return { error: "삭제할 별칭/호칭을 찾을 수 없습니다" };

  const { data: entity } = await supabase
    .from("entities")
    .select("project_id, name, summary, aliases")
    .eq("id", entityId)
    .single();

  if (!entity || entity.project_id !== projectId) {
    return { error: "작품 기억 항목을 찾을 수 없습니다" };
  }

  const aliases = Array.isArray(entity.aliases)
    ? (entity.aliases as string[])
    : [];
  const nextAliases = aliases.filter((value) => value !== normalizedAlias);

  if (nextAliases.length === aliases.length) {
    return { error: "별칭/호칭을 찾을 수 없습니다" };
  }

  const { error } = await supabase
    .from("entities")
    .update({ aliases: nextAliases })
    .eq("id", entityId);

  if (error) return { error: error.message };

  scheduleEntityEmbedding(entityId, projectId, owner.userId, {
    name: entity.name,
    summary: entity.summary,
    aliases: nextAliases,
  });

  revalidatePath(projectCodexPath(projectId));
  return { error: null, aliases: nextAliases };
}

// ── Entity CRUD ───────────────────────────────────────────────────────────

export async function createEntity(formData: FormData) {
  const parsed = parseCreateEntityForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { projectId, name, type, summary, aliases } = parsed.data;

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await createCodexEntity(supabase, {
    projectId,
    userId: owner.userId,
    name,
    type,
    summary,
    aliases,
  });
  if (result.error) return result;

  revalidatePath(projectCodexPath(projectId));
  return { error: null };
}

export async function updateEntity(formData: FormData) {
  const parsed = parseUpdateEntityForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { entityId, projectId, name, type, summary, aliases } = parsed.data;

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const target = await requireCodexEntityTarget(supabase, entityId, projectId);
  if (target.error) return target;

  const result = await updateCodexEntity(
    supabase,
    entityId,
    {
      name,
      type,
      summary,
      aliases,
    },
    projectId,
    owner.userId
  );
  if (result.error) return result;

  revalidatePath(projectCodexPath(projectId));
  return { error: null };
}

export async function deleteEntity(
  entityId: string,
  projectId: string,
  options?: { blockTerm?: boolean }
) {
  const parsed = parseEntityMutationIds({ entityId, projectId });
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const entity = await requireCodexEntityTarget(supabase, entityId, projectId);
  if (entity.error !== null) return entity;

  const result = await deleteCodexEntity(supabase, {
    entityId,
    projectId,
    entityName: entity.name,
    blockTerm: options?.blockTerm,
  });
  if (result.error) return result;

  revalidatePath(projectCodexPath(projectId));
  return { error: null };
}

export async function mergeEntityAsAlias(
  sourceEntityId: string,
  targetEntityId: string,
  projectId: string
) {
  const parsed = parseEntityMutationIds({ sourceEntityId, targetEntityId, projectId });
  if (!parsed.ok) return { error: parsed.error };
  if (sourceEntityId === targetEntityId) {
    return { error: "같은 항목으로는 합칠 수 없습니다" };
  }

  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await mergeCodexEntityAsAlias(supabase, {
    userId: owner.userId,
    sourceEntityId,
    targetEntityId,
    projectId,
  });
  if (result.error) return result;

  revalidatePath(projectCodexPath(projectId));
  return result;
}

export async function updateEntityLink(
  linkId: string,
  projectId: string,
  relationType: string
) {
  const parsed = parseEntityLinkUpdateInput(linkId, projectId, relationType);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const target = await requireCodexLinkTarget(supabase, linkId, projectId);
  if (target.error) return target;

  const result = await updateCodexEntityLink(
    supabase,
    parsed.data.linkId,
    parsed.data.relationType
  );
  if (result.error) return result;

  revalidatePath(projectCodexPath(projectId));
  return { error: null };
}

// ── Link CRUD ─────────────────────────────────────────────────────────────

export async function createEntityLink(formData: FormData) {
  const parsed = parseCreateEntityLinkForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { projectId, fromId, toId, relationType, direction, weight } = parsed.data;

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const endpoints = await requireCodexEntityTargets(
    supabase,
    [fromId, toId],
    projectId,
  );
  if (endpoints.error) return endpoints;

  const result = await createCodexEntityLink(supabase, {
    fromId,
    toId,
    relationType,
    direction,
    weight,
  });
  if (result.error) return result;

  revalidatePath(projectCodexPath(projectId));
  return { error: null };
}

export async function deleteEntityLink(
  linkId: string,
  projectId: string,
  _entityId: string
) {
  void _entityId;
  const parsed = parseEntityLinkDeleteInput({ linkId, entityId: _entityId, projectId });
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const target = await requireCodexLinkTarget(supabase, linkId, projectId);
  if (target.error) return target;

  const result = await deleteCodexEntityLink(supabase, linkId);
  if (result.error) return result;

  revalidatePath(projectCodexPath(projectId));
  return { error: null };
}

export async function deleteEntityLinkByRelation(
  entityId: string,
  relatedId: string,
  relationType: string,
  projectId: string
) {
  const parsed = parseEntityLinkDeleteInput({
    entityId,
    relatedId,
    relationType,
    projectId,
  });
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const entities = await requireCodexEntityTargets(
    supabase,
    [entityId, relatedId],
    projectId,
  );
  if (entities.error) {
    return {
      error: isCodexTargetAccessError(entities.error)
        ? "권한이 없습니다"
        : entities.error,
    };
  }

  const { data: link } = await supabase
    .from("entity_links")
    .select("id")
    .or(
      `and(from_id.eq.${entityId},to_id.eq.${relatedId}),and(from_id.eq.${relatedId},to_id.eq.${entityId})`
    )
    .eq("relation_type", relationType)
    .single();

  if (!link) return { error: "관계를 찾을 수 없습니다" };

  const result = await deleteCodexEntityLink(supabase, link.id);
  if (result.error) return result;

  revalidatePath(projectCodexPath(projectId));
  return { error: null };
}
