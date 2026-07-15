"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProjectOwner } from "@/lib/auth/ownership";
import { createLLMUsageLogger, embedText } from "@/lib/services";
import {
  emptyCodexData,
  getCodexDataForProject,
} from "@/lib/services/codex/read.service";
import {
  createCodexEntity,
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
  parseCreateEntityForm,
  parseCreateEntityLinkForm,
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
    .update(fields)
    .eq("id", entityId);

  if (error) return { error: error.message };

  if (fields.name || fields.summary || fields.aliases) {
    const { data: full } = await supabase
      .from("entities")
      .select("name, summary, aliases")
      .eq("id", entityId)
      .single();

    if (full) {
      after(async () => {
        const embeddingText = [
          full.name,
          full.summary,
          ...(Array.isArray(full.aliases) ? (full.aliases as string[]) : []),
        ]
          .filter(Boolean)
          .join(" ");
        const bgSupabase = await createClient();
        const embedding = await embedText(embeddingText, {
          onComplete: createLLMUsageLogger(bgSupabase, {
            projectId,
            userId: owner.userId,
            feature: "embedding",
            promptTemplateKey: "codex.entity_embedding",
            promptTemplateVersion: "v1",
          }),
        });
        const { error: embeddingError } = await bgSupabase
          .from("entities")
          .update({ embedding: JSON.stringify(embedding) })
          .eq("id", entityId);
        if (embeddingError) {
          console.error("[CodexActions] embedding update error:", embeddingError.message);
        }
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

  after(async () => {
    const embeddingText = [entity.name, entity.summary, ...nextAliases]
      .filter(Boolean)
      .join(" ");
    const bgSupabase = await createClient();
    const embedding = await embedText(embeddingText, {
      onComplete: createLLMUsageLogger(bgSupabase, {
        projectId,
        userId: owner.userId,
        feature: "embedding",
        promptTemplateKey: "codex.entity_embedding",
        promptTemplateVersion: "v1",
      }),
    });
    const { error: embeddingError } = await bgSupabase
      .from("entities")
      .update({ embedding: JSON.stringify(embedding) })
      .eq("id", entityId);
    if (embeddingError) {
      console.error("[CodexActions] embedding update error:", embeddingError.message);
    }
  });

  revalidatePath(projectCodexPath(projectId));
  return { error: null, aliases: nextAliases };
}

// ── Entity CRUD ───────────────────────────────────────────────────────────

export async function createEntity(formData: FormData) {
  const supabase = await createClient();

  const parsed = parseCreateEntityForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const { projectId, name, type, summary, aliases } = parsed.data;

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await createCodexEntity(supabase, {
    projectId,
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
  const supabase = await createClient();

  const { entityId, projectId, name, type, summary, aliases } =
    parseUpdateEntityForm(formData);

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: target } = await supabase
    .from("entities")
    .select("project_id")
    .eq("id", entityId)
    .single();
  if (!target || target.project_id !== projectId) {
    return { error: "작품 기억 항목을 찾을 수 없습니다" };
  }

  const result = await updateCodexEntity(
    supabase,
    entityId,
    {
      name,
      type,
      summary,
      aliases,
    },
    projectId
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
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: entity } = await supabase
    .from("entities")
    .select("project_id, name")
    .eq("id", entityId)
    .single();

  if (!entity || entity.project_id !== projectId) {
    return { error: "작품 기억 항목을 찾을 수 없습니다" };
  }

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
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const result = await mergeCodexEntityAsAlias(supabase, {
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
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  // Verify ownership via from_id → entity → project
  const { data: link } = await supabase
    .from("entity_links")
    .select("from_id")
    .eq("id", linkId)
    .single();

  if (!link) return { error: "관계를 찾을 수 없습니다" };

  const { data: entity } = await supabase
    .from("entities")
    .select("project_id")
    .eq("id", link.from_id)
    .single();

  if (!entity || entity.project_id !== projectId) {
    return { error: "권한이 없습니다" };
  }

  const result = await updateCodexEntityLink(supabase, linkId, relationType);
  if (result.error) return result;

  revalidatePath(projectCodexPath(projectId));
  return { error: null };
}

// ── Link CRUD ─────────────────────────────────────────────────────────────

export async function createEntityLink(formData: FormData) {
  const supabase = await createClient();

  const { projectId, fromId, toId, relationType, direction, weight } =
    parseCreateEntityLinkForm(formData);

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  // Both endpoints must belong to the owned project (defence-in-depth on RLS).
  const { data: endpoints } = await supabase
    .from("entities")
    .select("id, project_id")
    .in("id", [fromId, toId]);
  if (
    !endpoints ||
    endpoints.length !== new Set([fromId, toId]).size ||
    endpoints.some((e) => e.project_id !== projectId)
  ) {
    return { error: "권한이 없거나 존재하지 않는 작품 기억 항목입니다" };
  }

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
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: link } = await supabase
    .from("entity_links")
    .select("from_id")
    .eq("id", linkId)
    .single();

  if (!link) return { error: "관계를 찾을 수 없습니다" };

  const { data: entity } = await supabase
    .from("entities")
    .select("project_id")
    .eq("id", link.from_id)
    .single();

  if (!entity || entity.project_id !== projectId) {
    return { error: "권한이 없습니다" };
  }

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
  const supabase = await createClient();

  const owner = await requireProjectOwner(supabase, projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: entities } = await supabase
    .from("entities")
    .select("id, project_id")
    .in("id", [entityId, relatedId]);

  if (
    !entities ||
    entities.length !== 2 ||
    entities.some((e) => e.project_id !== projectId)
  ) {
    return { error: "권한이 없습니다" };
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
