import { z } from "zod";
import type { EntityType, LinkDirection } from "@/types";

const ENTITY_TYPES = [
  "CHARACTER",
  "ORGANIZATION",
  "PLACE",
  "ITEM",
  "CONCEPT",
  "MAGIC_SYSTEM",
] as const;

const createEntitySchema = z.object({
  projectId: z.uuid(),
  name: z.string().min(1, "이름을 입력하세요").max(200),
  type: z.enum(ENTITY_TYPES),
  summary: z.string().max(5000).nullable(),
  aliases: z.string().max(1000).nullable(),
});

export interface CreateEntityFormValues {
  projectId: string;
  name: string;
  type: EntityType;
  summary: string | null;
  aliases: string[] | null;
}

export interface UpdateEntityFormValues {
  entityId: string;
  projectId: string;
  name: string;
  type: EntityType;
  summary: string | null;
  aliases: string[] | null;
}

export interface CreateEntityLinkFormValues {
  projectId: string;
  fromId: string;
  toId: string;
  relationType: string;
  direction: LinkDirection;
  weight: number;
}

export function parseCreateEntityForm(
  formData: FormData
): { ok: true; data: CreateEntityFormValues } | { ok: false; error: string } {
  const parsed = createEntitySchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    type: formData.get("type"),
    summary: (formData.get("summary") as string) || null,
    aliases: (formData.get("aliases") as string) || null,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      aliases: parseAliases(parsed.data.aliases),
    },
  };
}

export function parseUpdateEntityForm(
  formData: FormData
): UpdateEntityFormValues {
  return {
    entityId: formData.get("entityId") as string,
    projectId: formData.get("projectId") as string,
    name: formData.get("name") as string,
    type: formData.get("type") as EntityType,
    summary: (formData.get("summary") as string) || null,
    aliases: parseAliases(formData.get("aliases") as string),
  };
}

export function parseCreateEntityLinkForm(
  formData: FormData
): CreateEntityLinkFormValues {
  return {
    projectId: formData.get("projectId") as string,
    fromId: formData.get("fromId") as string,
    toId: formData.get("toId") as string,
    relationType: formData.get("relationType") as string,
    direction: (formData.get("direction") as LinkDirection) || "UNI",
    weight: Number(formData.get("weight")) || 0.5,
  };
}

export function projectCodexPath(projectId: string): string {
  return `/projects/${projectId}`;
}

function parseAliases(value: string | null): string[] | null {
  return value
    ? value
        .split(",")
        .map((alias) => alias.trim())
        .filter(Boolean)
    : null;
}
