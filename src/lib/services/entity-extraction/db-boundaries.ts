import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { EntitySuggestionInsert, GenreRule } from "@/types";
import type { KnownEntity } from "../prompt-templates";

export async function loadKnownEntitiesData(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<{
  names: string[];
  typed: KnownEntity[];
}> {
  const { data } = await supabase
    .from("entities")
    .select("id, name, type, aliases")
    .eq("project_id", projectId);

  if (!data) return { names: [], typed: [] };

  const names: string[] = [];
  const typed: KnownEntity[] = [];
  for (const entity of data) {
    names.push(entity.name);
    typed.push({
      id: entity.id,
      name: entity.name,
      type: entity.type,
      aliases: Array.isArray(entity.aliases) ? (entity.aliases as string[]) : [],
    });
    if (Array.isArray(entity.aliases)) {
      for (const alias of entity.aliases) {
        if (typeof alias === "string") names.push(alias);
      }
    }
  }
  return { names, typed };
}

export async function loadGenreRules(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<{
  rulesText: string;
  excludedCharacterTerms: string[];
}> {
  const { data: project } = await supabase
    .from("projects")
    .select("genre")
    .eq("id", projectId)
    .single();

  if (!project?.genre) return { rulesText: "", excludedCharacterTerms: [] };

  const { data: kits } = await supabase
    .from("genre_kits")
    .select("name, rules, user_id")
    .eq("genre_type", project.genre)
    .order("user_id", { ascending: false, nullsFirst: false })
    .limit(1);

  const kit = kits?.[0];
  if (!kit?.rules) return { rulesText: "", excludedCharacterTerms: [] };

  const rulesObj = kit.rules as Record<string, unknown>;
  const excludedCharacterTerms = Array.isArray(
    rulesObj.excluded_character_terms
  )
    ? (rulesObj.excluded_character_terms as string[])
    : [];

  const rules = Array.isArray(rulesObj)
    ? (rulesObj as unknown as GenreRule[])
    : [];
  const rulesText =
    rules.length > 0
      ? `[${kit.name}]\n${rules
          .map((rule) => `- (${rule.category}) ${rule.rule}`)
          .join("\n")}`
      : "";

  return { rulesText, excludedCharacterTerms };
}

export async function loadProjectExcludedTerms(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<string[]> {
  const { data: project } = await supabase
    .from("projects")
    .select("excluded_terms")
    .eq("id", projectId)
    .single();

  return Array.isArray(project?.excluded_terms)
    ? (project.excluded_terms as string[])
    : [];
}

export async function loadExistingRelationStrings(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<string[]> {
  const { data: entities } = await supabase
    .from("entities")
    .select("id, name")
    .eq("project_id", projectId);

  if (!entities?.length) return [];

  const idToName = new Map(entities.map((entity) => [entity.id, entity.name]));
  const entityIds = entities.map((entity) => entity.id);

  const { data: links } = await supabase
    .from("entity_links")
    .select("from_id, to_id, relation_type")
    .or(`from_id.in.(${entityIds.join(",")}),to_id.in.(${entityIds.join(",")})`)
    .limit(30);

  if (!links?.length) return [];

  return links
    .map((link) => {
      const from = idToName.get(link.from_id);
      const to = idToName.get(link.to_id);
      if (!from || !to) return null;
      return `${from} → ${to} (${link.relation_type})`;
    })
    .filter((value): value is string => value !== null);
}

export async function loadExistingSuggestionNames(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("entity_suggestions")
    .select("name")
    .eq("project_id", projectId)
    .in("status", ["PENDING", "CONFIRMED", "DISMISSED"]);

  return data?.map((suggestion) => suggestion.name) ?? [];
}

export async function upsertEntitySuggestions(
  supabase: SupabaseClient<Database>,
  inserts: EntitySuggestionInsert[]
): Promise<number> {
  const { data, error } = await supabase
    .from("entity_suggestions")
    .upsert(inserts, {
      onConflict: "chapter_id,name",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    console.error("[EntityExtraction] suggestion upsert error:", error.message);
    return 0;
  }

  return data?.length ?? 0;
}

export async function loadEntitySuggestionRefs(
  supabase: SupabaseClient<Database>,
  input: {
    projectId: string;
    chapterId: string;
    names: string[];
  }
): Promise<
  Map<
    string,
    {
      id: string;
      matched_entity_id: string | null;
    }
  >
> {
  const uniqueNames = Array.from(new Set(input.names.filter(Boolean)));
  if (uniqueNames.length === 0) return new Map();

  const { data } = await supabase
    .from("entity_suggestions")
    .select("id, name, matched_entity_id")
    .eq("project_id", input.projectId)
    .eq("chapter_id", input.chapterId)
    .in("name", uniqueNames);

  const refs = new Map<
    string,
    { id: string; matched_entity_id: string | null }
  >();
  for (const row of data ?? []) {
    refs.set(row.name, {
      id: row.id,
      matched_entity_id: row.matched_entity_id,
    });
  }
  return refs;
}

export async function loadKnownEntityCanonicalNames(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from("entities")
    .select("name, aliases")
    .eq("project_id", projectId);

  const names = new Set<string>();
  for (const entity of data ?? []) {
    names.add(entity.name);
    if (Array.isArray(entity.aliases)) {
      for (const alias of entity.aliases as string[]) {
        if (alias) names.add(alias);
      }
    }
  }
  return names;
}

export async function loadExistingLinkDetails(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<Map<string, string>> {
  const { data: entities } = await supabase
    .from("entities")
    .select("id")
    .eq("project_id", projectId);

  if (!entities?.length) return new Map();

  const entityIds = entities.map((entity) => entity.id);
  const { data: links } = await supabase
    .from("entity_links")
    .select("from_id, to_id, relation_type")
    .or(`from_id.in.(${entityIds.join(",")}),to_id.in.(${entityIds.join(",")})`);

  const map = new Map<string, string>();
  for (const link of links ?? []) {
    map.set(`${link.from_id}|${link.to_id}`, link.relation_type);
  }
  return map;
}

export async function loadExistingLinks(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<Set<string>> {
  const { data: entities } = await supabase
    .from("entities")
    .select("id, name")
    .eq("project_id", projectId);

  if (!entities || entities.length === 0) return new Set();

  const idToName = new Map<string, string>();
  for (const entity of entities) {
    idToName.set(entity.id, entity.name);
  }

  const entityIds = entities.map((entity) => entity.id);
  const { data: links } = await supabase
    .from("entity_links")
    .select("from_id, to_id, relation_type")
    .or(`from_id.in.(${entityIds.join(",")}),to_id.in.(${entityIds.join(",")})`);

  const linkSet = new Set<string>();
  for (const link of links ?? []) {
    const fromName = idToName.get(link.from_id);
    const toName = idToName.get(link.to_id);
    if (fromName && toName) {
      linkSet.add(`${fromName}|${toName}|${link.relation_type}`);
    }
  }

  return linkSet;
}
