"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireProjectOwner } from "@/lib/auth/ownership";
import { DEFAULT_PLANNING_BLOCKS } from "@/lib/planning/constants";
import type {
  PlanningBlock,
  PlanningBlockKind,
  PlanningBlockStatus,
} from "@/types";

const projectIdSchema = z.uuid();
const blockIdSchema = z.uuid();

const updatePlanningBlockSchema = z.object({
  blockId: blockIdSchema,
  projectId: projectIdSchema,
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).nullable(),
  notes: z.string().trim().max(5000).nullable(),
  status: z.enum([
    "PLANNED",
    "EXPANDED",
    "NEEDS_DETAIL",
    "MANUSCRIPT_SEEN",
    "MEMORY_LINKED",
    "NEEDS_REVIEW",
  ]),
});

const createPlanningChildSchema = z.object({
  projectId: projectIdSchema,
  parentId: blockIdSchema,
  kind: z.enum([
    "EPISODE",
    "CHAPTER",
    "SCENE",
    "EVENT",
    "PROMISE",
    "CHARACTER_PLAN",
    "PLACE_PLAN",
  ]),
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().max(500).nullable(),
});

const deletePlanningBlockSchema = z.object({
  projectId: projectIdSchema,
  blockId: blockIdSchema,
});

const chapterReferenceSchema = z.object({
  projectId: projectIdSchema,
  planningBlockId: blockIdSchema,
  chapterId: blockIdSchema,
});

const entityReferenceSchema = z.object({
  projectId: projectIdSchema,
  planningBlockId: blockIdSchema,
  entityId: blockIdSchema,
});

function planningPath(projectId: string) {
  return `/projects/${projectId}/planning`;
}

function normalizeNullableText(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function formatPlanningStorageError(error: { code?: string; message: string }) {
  if (
    error.code === "PGRST205" ||
    (error.message.includes("planning_blocks") &&
      error.message.includes("schema cache"))
  ) {
    return "구상 데이터베이스가 아직 준비되지 않았습니다. Supabase에 20260601120000_v2_progressive_planning migration을 적용한 뒤 다시 시도해주세요.";
  }

  return error.message;
}

function isUniqueViolation(error: { code?: string }) {
  return error.code === "23505";
}

export async function getPlanningBlocks(projectId: string): Promise<{
  error: string | null;
  blocks: PlanningBlock[];
}> {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) {
    return { error: "프로젝트 ID가 올바르지 않습니다", blocks: [] };
  }

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsedProjectId.data);
  if (!owner.ok) return { error: owner.error, blocks: [] };

  const ensured = await ensureDefaultPlanningBlocks(parsedProjectId.data);
  if (ensured.error) return { error: ensured.error, blocks: [] };

  const { data, error } = await supabase
    .from("planning_blocks")
    .select("*")
    .eq("project_id", parsedProjectId.data)
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return { error: formatPlanningStorageError(error), blocks: [] };
  return { error: null, blocks: (data as PlanningBlock[]) ?? [] };
}

export async function ensureDefaultPlanningBlocks(projectId: string): Promise<{
  error: string | null;
}> {
  const parsedProjectId = projectIdSchema.safeParse(projectId);
  if (!parsedProjectId.success) return { error: "프로젝트 ID가 올바르지 않습니다" };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsedProjectId.data);
  if (!owner.ok) return { error: owner.error };

  const { data: existing, error: readError } = await supabase
    .from("planning_blocks")
    .select("structure_key")
    .eq("project_id", parsedProjectId.data)
    .is("parent_id", null);

  if (readError) return { error: formatPlanningStorageError(readError) };

  const existingKeys = new Set(
    ((existing ?? []) as Array<{ structure_key: string | null }>)
      .map((block) => block.structure_key)
      .filter(Boolean)
  );
  const missing = DEFAULT_PLANNING_BLOCKS.filter(
    (block) => !existingKeys.has(block.structureKey)
  );

  if (missing.length === 0) return { error: null };

  const { error: insertError } = await supabase.from("planning_blocks").insert(
    missing.map((block) => ({
      project_id: parsedProjectId.data,
      parent_id: null,
      kind: "ROOT" satisfies PlanningBlockKind,
      title: block.title,
      summary: null,
      notes: null,
      status: "PLANNED" satisfies PlanningBlockStatus,
      position: block.position,
      structure_key: block.structureKey,
    }))
  );

  if (insertError && insertError.code !== "23505") {
    return { error: formatPlanningStorageError(insertError) };
  }

  return { error: null };
}

export async function updatePlanningBlock(input: {
  blockId: string;
  projectId: string;
  title: string;
  summary: string | null;
  notes: string | null;
  status: PlanningBlockStatus;
}) {
  const parsed = updatePlanningBlockSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { data, error } = await supabase
    .from("planning_blocks")
    .update({
      title: parsed.data.title,
      summary: normalizeNullableText(parsed.data.summary),
      notes: normalizeNullableText(parsed.data.notes),
      status: parsed.data.status,
    })
    .eq("id", parsed.data.blockId)
    .eq("project_id", parsed.data.projectId)
    .select("id")
    .maybeSingle();

  if (error) return { error: formatPlanningStorageError(error) };
  if (!data) return { error: "구상 블록을 찾을 수 없습니다" };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function createPlanningChildBlock(input: {
  projectId: string;
  parentId: string;
  kind: Exclude<PlanningBlockKind, "ROOT">;
  title: string;
  summary: string | null;
}) {
  const parsed = createPlanningChildSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message, id: null };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error, id: null };

  const { data: parent, error: parentError } = await supabase
    .from("planning_blocks")
    .select("id, kind")
    .eq("id", parsed.data.parentId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();

  if (parentError) return { error: formatPlanningStorageError(parentError), id: null };
  if (!parent) return { error: "구상 블록을 찾을 수 없습니다", id: null };

  const { data: lastChild } = await supabase
    .from("planning_blocks")
    .select("position")
    .eq("project_id", parsed.data.projectId)
    .eq("parent_id", parsed.data.parentId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextPosition =
    typeof lastChild?.position === "number" ? lastChild.position + 1 : 0;

  const { data, error } = await supabase
    .from("planning_blocks")
    .insert({
      project_id: parsed.data.projectId,
      parent_id: parsed.data.parentId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      summary: normalizeNullableText(parsed.data.summary),
      notes: null,
      status: "PLANNED",
      position: nextPosition,
      structure_key: null,
    })
    .select("id")
    .single();

  if (error) return { error: formatPlanningStorageError(error), id: null };

  const { error: statusError } = await supabase
    .from("planning_blocks")
    .update({ status: "EXPANDED" })
    .eq("id", parsed.data.parentId)
    .eq("project_id", parsed.data.projectId)
    .eq("status", "PLANNED");

  if (statusError) return { error: formatPlanningStorageError(statusError), id: null };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null, id: data.id as string };
}

export async function deletePlanningBlock(input: {
  projectId: string;
  blockId: string;
}) {
  const parsed = deletePlanningBlockSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: block, error: readError } = await supabase
    .from("planning_blocks")
    .select("kind")
    .eq("id", parsed.data.blockId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();

  if (readError) return { error: formatPlanningStorageError(readError) };
  if (!block) return { error: "구상 카드를 찾을 수 없습니다" };
  if (block.kind === "ROOT") return { error: "기본 4블록은 삭제할 수 없습니다" };

  const { error } = await supabase
    .from("planning_blocks")
    .delete()
    .eq("id", parsed.data.blockId)
    .eq("project_id", parsed.data.projectId);

  if (error) return { error: formatPlanningStorageError(error) };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function linkPlanningBlockToChapter(input: {
  projectId: string;
  planningBlockId: string;
  chapterId: string;
}) {
  const parsed = chapterReferenceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: block, error: blockError } = await supabase
    .from("planning_blocks")
    .select("id, kind")
    .eq("id", parsed.data.planningBlockId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();

  if (blockError) return { error: formatPlanningStorageError(blockError) };
  if (!block) return { error: "구상 카드를 찾을 수 없습니다" };
  if (block.kind !== "CHAPTER") {
    return { error: "화 카드에서만 기존 회차를 참조할 수 있습니다" };
  }

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .select("id")
    .eq("id", parsed.data.chapterId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();

  if (chapterError) return { error: chapterError.message };
  if (!chapter) return { error: "참조할 회차를 찾을 수 없습니다" };

  const { error: deleteError } = await supabase
    .from("planning_links")
    .delete()
    .eq("project_id", parsed.data.projectId)
    .eq("planning_block_id", parsed.data.planningBlockId)
    .eq("target_type", "chapter")
    .eq("link_kind", "PLANNED_FOR");

  if (deleteError) return { error: formatPlanningStorageError(deleteError) };

  const { error: insertError } = await supabase.from("planning_links").insert({
    project_id: parsed.data.projectId,
    planning_block_id: parsed.data.planningBlockId,
    target_type: "chapter",
    target_id: parsed.data.chapterId,
    link_kind: "PLANNED_FOR",
  });

  if (insertError && !isUniqueViolation(insertError)) {
    return { error: formatPlanningStorageError(insertError) };
  }

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function unlinkPlanningBlockFromChapter(input: {
  projectId: string;
  planningBlockId: string;
  chapterId: string;
}) {
  const parsed = chapterReferenceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { error } = await supabase
    .from("planning_links")
    .delete()
    .eq("project_id", parsed.data.projectId)
    .eq("planning_block_id", parsed.data.planningBlockId)
    .eq("target_type", "chapter")
    .eq("target_id", parsed.data.chapterId)
    .eq("link_kind", "PLANNED_FOR");

  if (error) return { error: formatPlanningStorageError(error) };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function linkPlanningBlockToEntity(input: {
  projectId: string;
  planningBlockId: string;
  entityId: string;
}) {
  const parsed = entityReferenceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { data: block, error: blockError } = await supabase
    .from("planning_blocks")
    .select("id, kind")
    .eq("id", parsed.data.planningBlockId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();

  if (blockError) return { error: formatPlanningStorageError(blockError) };
  if (!block) return { error: "구상 카드를 찾을 수 없습니다" };
  if (block.kind === "ROOT") {
    return { error: "기본 4블록에는 작품 기억을 직접 연결하지 않습니다" };
  }

  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .select("id")
    .eq("id", parsed.data.entityId)
    .eq("project_id", parsed.data.projectId)
    .maybeSingle();

  if (entityError) return { error: entityError.message };
  if (!entity) return { error: "연결할 작품 기억을 찾을 수 없습니다" };

  const { data: existing, error: existingError } = await supabase
    .from("planning_links")
    .select("id")
    .eq("project_id", parsed.data.projectId)
    .eq("planning_block_id", parsed.data.planningBlockId)
    .eq("target_type", "entity")
    .eq("target_id", parsed.data.entityId)
    .eq("link_kind", "MEMORY_LINKED")
    .maybeSingle();

  if (existingError) return { error: formatPlanningStorageError(existingError) };
  if (existing) {
    revalidatePath(planningPath(parsed.data.projectId));
    return { error: null };
  }

  const { error: insertError } = await supabase.from("planning_links").insert({
    project_id: parsed.data.projectId,
    planning_block_id: parsed.data.planningBlockId,
    target_type: "entity",
    target_id: parsed.data.entityId,
    link_kind: "MEMORY_LINKED",
  });

  if (insertError && !isUniqueViolation(insertError)) {
    return { error: formatPlanningStorageError(insertError) };
  }

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}

export async function unlinkPlanningBlockFromEntity(input: {
  projectId: string;
  planningBlockId: string;
  entityId: string;
}) {
  const parsed = entityReferenceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const owner = await requireProjectOwner(supabase, parsed.data.projectId);
  if (!owner.ok) return { error: owner.error };

  const { error } = await supabase
    .from("planning_links")
    .delete()
    .eq("project_id", parsed.data.projectId)
    .eq("planning_block_id", parsed.data.planningBlockId)
    .eq("target_type", "entity")
    .eq("target_id", parsed.data.entityId)
    .eq("link_kind", "MEMORY_LINKED");

  if (error) return { error: formatPlanningStorageError(error) };

  revalidatePath(planningPath(parsed.data.projectId));
  return { error: null };
}
