import { z } from "zod";
import type { EntityType, LinkDirection } from "@/types";
import { isKnownRelationType, type RelationType } from "@/lib/relation-schema";

const ENTITY_TYPES = [
  "CHARACTER",
  "ORGANIZATION",
  "PLACE",
  "ITEM",
  "CONCEPT",
  "MAGIC_SYSTEM",
] as const;

const uuidSchema = z.uuid("올바른 식별자가 아닙니다");
const entityNameSchema = z.string().trim().min(1, "이름을 입력하세요").max(200);
const summarySchema = z.string().max(5000).nullable();
const aliasesTextSchema = z.string().max(1000).nullable();
const aliasesSchema = z
  .array(z.string().trim().min(1, "빈 별칭은 저장할 수 없습니다").max(200, "별칭이 너무 깁니다"))
  .max(50, "별칭은 50개까지 저장할 수 있습니다")
  .nullable();
const entityTypeSchema = z.enum(ENTITY_TYPES, {
  error: "지원하지 않는 항목 유형입니다",
});
const relationTypeSchema = z.custom<RelationType>(
  (value) => typeof value === "string" && isKnownRelationType(value),
  "지원하지 않는 관계 유형입니다"
);
const directionSchema = z.enum(["UNI", "BI"]);
const weightSchema = z.preprocess(
  (value) => (value === null || value === "" ? 0.5 : value),
  z.coerce.number().min(0, "관계 강도는 0 이상이어야 합니다").max(1, "관계 강도는 1 이하여야 합니다")
);

const createEntitySchema = z.object({
  projectId: uuidSchema,
  name: entityNameSchema,
  type: entityTypeSchema,
  summary: summarySchema,
  aliases: aliasesTextSchema,
});

const updateEntitySchema = createEntitySchema.extend({ entityId: uuidSchema });

const createEntityLinkSchema = z
  .object({
    projectId: uuidSchema,
    fromId: uuidSchema,
    toId: uuidSchema,
    relationType: relationTypeSchema,
    direction: directionSchema.default("UNI"),
    weight: weightSchema,
  })
  .refine((value) => value.fromId !== value.toId, {
    message: "같은 항목끼리는 관계를 만들 수 없습니다",
    path: ["toId"],
  });

const inlineEntitySchema = z.object({
  entityId: uuidSchema,
  projectId: uuidSchema,
  fields: z
    .object({
      name: entityNameSchema.optional(),
      type: entityTypeSchema.optional(),
      summary: summarySchema.optional(),
      aliases: aliasesSchema.optional(),
    })
    .strict()
    .refine((fields) => Object.keys(fields).length > 0, "수정할 내용이 없습니다"),
});

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

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
  relationType: RelationType;
  direction: LinkDirection;
  weight: number;
}

export function parseCreateEntityForm(
  formData: FormData
): ParseResult<CreateEntityFormValues> {
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
  const aliases = aliasesSchema.safeParse(parseAliases(parsed.data.aliases));
  if (!aliases.success) {
    return { ok: false, error: aliases.error.issues[0].message };
  }

  return {
    ok: true,
    data: {
      ...parsed.data,
      aliases: aliases.data,
    },
  };
}

export function parseUpdateEntityForm(
  formData: FormData
): ParseResult<UpdateEntityFormValues> {
  const parsed = updateEntitySchema.safeParse({
    entityId: formData.get("entityId") as string,
    projectId: formData.get("projectId") as string,
    name: formData.get("name") as string,
    type: formData.get("type"),
    summary: (formData.get("summary") as string) || null,
    aliases: (formData.get("aliases") as string) || null,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const aliases = aliasesSchema.safeParse(parseAliases(parsed.data.aliases));
  if (!aliases.success) {
    return { ok: false, error: aliases.error.issues[0].message };
  }
  return {
    ok: true,
    data: { ...parsed.data, aliases: aliases.data },
  };
}

export function parseCreateEntityLinkForm(
  formData: FormData
): ParseResult<CreateEntityLinkFormValues> {
  const parsed = createEntityLinkSchema.safeParse({
    projectId: formData.get("projectId"),
    fromId: formData.get("fromId"),
    toId: formData.get("toId"),
    relationType: formData.get("relationType"),
    direction: formData.get("direction") || undefined,
    weight: formData.get("weight"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  return { ok: true, data: parsed.data };
}

export function parseUpdateEntityInlineInput(
  entityId: unknown,
  projectId: unknown,
  fields: unknown
) {
  const parsed = inlineEntitySchema.safeParse({ entityId, projectId, fields });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  return { ok: true as const, data: parsed.data };
}

export function parseEntityLinkUpdateInput(
  linkId: unknown,
  projectId: unknown,
  relationType: unknown
) {
  const parsed = z
    .object({ linkId: uuidSchema, projectId: uuidSchema, relationType: relationTypeSchema })
    .safeParse({ linkId, projectId, relationType });
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  return { ok: true as const, data: parsed.data };
}

export function parseEntityMutationIds(values: {
  entityId?: unknown;
  sourceEntityId?: unknown;
  targetEntityId?: unknown;
  projectId: unknown;
}) {
  const schema = z.object({
    entityId: uuidSchema.optional(),
    sourceEntityId: uuidSchema.optional(),
    targetEntityId: uuidSchema.optional(),
    projectId: uuidSchema,
  });
  const parsed = schema.safeParse(values);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  return { ok: true as const, data: parsed.data };
}

export function parseEntityLinkDeleteInput(values: {
  linkId?: unknown;
  entityId?: unknown;
  relatedId?: unknown;
  relationType?: unknown;
  projectId: unknown;
}) {
  const parsed = z
    .object({
      linkId: uuidSchema.optional(),
      entityId: uuidSchema.optional(),
      relatedId: uuidSchema.optional(),
      relationType: relationTypeSchema.optional(),
      projectId: uuidSchema,
    })
    .safeParse(values);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0].message };
  }
  return { ok: true as const, data: parsed.data };
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
