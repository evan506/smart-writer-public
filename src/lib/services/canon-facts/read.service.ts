import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export interface CodexFactSource {
  id: string;
  chapterId: string | null;
  chapterNum: number | null;
  chapterTitle: string | null;
  chunkId: string | null;
  evidenceText: string | null;
  evidenceKind: string;
}

export interface CodexFact {
  id: string;
  entityId: string;
  factType: string;
  factKey: string | null;
  value: string;
  status: string;
  confidence: number;
  establishedChapterId: string | null;
  establishedChapterNum: number | null;
  approvedAt: string | null;
  sources: CodexFactSource[];
}

type FactRow = {
  id: string;
  entity_id: string;
  fact_type: string;
  fact_key: string | null;
  value: string;
  status: string;
  confidence: number;
  established_chapter_id: string | null;
  approved_at: string | null;
};

type SourceRow = {
  id: string;
  fact_id: string;
  chapter_id: string | null;
  chunk_id: string | null;
  evidence_text: string | null;
  evidence_kind: string;
};

type ChapterRow = {
  id: string;
  chapter_num: number;
  title: string | null;
};

export async function listApprovedCodexFactsByEntity(
  supabase: SupabaseClient,
  projectId: string,
  entityIds: string[]
): Promise<Record<string, CodexFact[]>> {
  if (entityIds.length === 0) return {};

  const { data: facts, error } = await supabase
    .from("canon_facts")
    .select(
      "id, entity_id, fact_type, fact_key, value, status, confidence, established_chapter_id, approved_at"
    )
    .eq("project_id", projectId)
    .eq("status", "APPROVED")
    .in("entity_id", entityIds)
    .order("fact_type")
    .order("created_at");

  if (error || !facts || facts.length === 0) return {};

  const factRows = facts as FactRow[];
  const factIds = factRows.map((fact) => fact.id);
  const chapterIds = new Set<string>();

  for (const fact of factRows) {
    if (fact.established_chapter_id) chapterIds.add(fact.established_chapter_id);
  }

  const { data: sources } = await supabase
    .from("canon_fact_sources")
    .select("id, fact_id, chapter_id, chunk_id, evidence_text, evidence_kind")
    .in("fact_id", factIds)
    .order("created_at");

  const sourceRows = (sources ?? []) as SourceRow[];
  for (const source of sourceRows) {
    if (source.chapter_id) chapterIds.add(source.chapter_id);
  }

  const chapterMap = new Map<string, ChapterRow>();
  if (chapterIds.size > 0) {
    const { data: chapters } = await supabase
      .from("chapters")
      .select("id, chapter_num, title")
      .eq("project_id", projectId)
      .in("id", Array.from(chapterIds));

    for (const chapter of (chapters ?? []) as ChapterRow[]) {
      chapterMap.set(chapter.id, chapter);
    }
  }

  const sourcesByFact = new Map<string, CodexFactSource[]>();
  for (const source of sourceRows) {
    const chapter = source.chapter_id ? chapterMap.get(source.chapter_id) : null;
    const item: CodexFactSource = {
      id: source.id,
      chapterId: source.chapter_id,
      chapterNum: chapter?.chapter_num ?? null,
      chapterTitle: chapter?.title ?? null,
      chunkId: source.chunk_id,
      evidenceText: source.evidence_text,
      evidenceKind: source.evidence_kind,
    };
    sourcesByFact.set(source.fact_id, [...(sourcesByFact.get(source.fact_id) ?? []), item]);
  }

  const result: Record<string, CodexFact[]> = {};
  for (const fact of factRows) {
    const chapter = fact.established_chapter_id
      ? chapterMap.get(fact.established_chapter_id)
      : null;
    const item: CodexFact = {
      id: fact.id,
      entityId: fact.entity_id,
      factType: fact.fact_type,
      factKey: fact.fact_key,
      value: fact.value,
      status: fact.status,
      confidence: fact.confidence,
      establishedChapterId: fact.established_chapter_id,
      establishedChapterNum: chapter?.chapter_num ?? null,
      approvedAt: fact.approved_at,
      sources: sourcesByFact.get(fact.id) ?? [],
    };
    result[fact.entity_id] = [...(result[fact.entity_id] ?? []), item];
  }

  return result;
}
