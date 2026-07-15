import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database.types";

export type EntityImportance = "MAIN" | "SUPPORTING" | "MINOR";

// PostgREST .in() lists go through the URL — keep batches bounded.
const IN_BATCH_SIZE = 100;

function chunkIds(ids: string[], size: number): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    batches.push(ids.slice(i, i + size));
  }
  return batches;
}

function asMetadataObject(metadata: Json | null): Record<string, Json | undefined> {
  if (typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)) {
    return { ...metadata };
  }
  return {};
}

/**
 * Recalculates importance for every entity in the project with batched reads
 * (previously 3 sequential queries per entity on every chapter save) and
 * writes only rows whose importance actually changed. Merges into existing
 * metadata instead of replacing the whole jsonb value. Read failures skip the
 * recalculation (keep previous importance) rather than degrading data.
 */
export async function recalculateEntityImportance(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<void> {
  const { data: entities, error: entitiesError } = await supabase
    .from("entities")
    .select("id, metadata")
    .eq("project_id", projectId);

  if (entitiesError) {
    console.error(
      "[EntityImportance] entity list load failed:",
      entitiesError.message
    );
    return;
  }
  if (!entities?.length) return;

  const relationCounts = new Map<string, number>();
  const chapterSets = new Map<string, Set<string>>();
  const bump = (map: Map<string, number>, id: string) =>
    map.set(id, (map.get(id) ?? 0) + 1);

  for (const batch of chunkIds(entities.map((e) => e.id), IN_BATCH_SIZE)) {
    const [fromLinks, toLinks, mentionRows] = await Promise.all([
      supabase.from("entity_links").select("from_id").in("from_id", batch),
      supabase.from("entity_links").select("to_id").in("to_id", batch),
      supabase
        .from("mentions")
        .select("entity_id, chunks!inner(chapter_id)")
        .in("entity_id", batch),
    ]);

    if (fromLinks.error || toLinks.error || mentionRows.error) {
      console.error(
        "[EntityImportance] batched read failed, keeping previous importance:",
        fromLinks.error?.message ??
          toLinks.error?.message ??
          mentionRows.error?.message
      );
      return;
    }

    for (const row of fromLinks.data ?? []) bump(relationCounts, row.from_id);
    for (const row of toLinks.data ?? []) bump(relationCounts, row.to_id);
    for (const row of mentionRows.data ?? []) {
      const chapterId = (row.chunks as { chapter_id: string } | null)
        ?.chapter_id;
      if (!chapterId) continue;
      const set = chapterSets.get(row.entity_id) ?? new Set<string>();
      set.add(chapterId);
      chapterSets.set(row.entity_id, set);
    }
  }

  const updates = entities.flatMap((entity) => {
    const metadata = asMetadataObject(entity.metadata);
    const importance = resolveEntityImportance(
      relationCounts.get(entity.id) ?? 0,
      chapterSets.get(entity.id)?.size ?? 0
    );
    if (metadata.importance === importance) return [];
    return [{ id: entity.id, metadata: { ...metadata, importance } as Json }];
  });

  await Promise.all(
    updates.map(async (update) => {
      const { error } = await supabase
        .from("entities")
        .update({ metadata: update.metadata })
        .eq("id", update.id);
      if (error) {
        console.error(
          `[EntityImportance] update failed for ${update.id}:`,
          error.message
        );
      }
    })
  );
}

export function resolveEntityImportance(
  relationCount: number,
  chapterCount: number
): EntityImportance {
  if (relationCount >= 5 || chapterCount >= 5) return "MAIN";
  if (relationCount >= 2 || chapterCount >= 2) return "SUPPORTING";
  return "MINOR";
}
