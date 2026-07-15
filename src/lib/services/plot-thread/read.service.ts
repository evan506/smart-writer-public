import type { createClient } from "@/lib/supabase/server";
import {
  isPlotThreadRowKind,
  type PlotThreadCellSignal,
} from "@/lib/planning/plot-thread-constants";
import { listApprovedCodexFactsByEntity } from "@/lib/services/canon-facts/read.service";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// ── Public payload shapes (serializable, passed to the client view) ──────────

export interface PlotThreadChapterColumn {
  id: string;
  chapterNum: number;
  title: string | null;
}

export interface PlotThreadManualSource {
  kind: "thread_chapter" | "card_planned_for";
  blockId: string | null;
  blockTitle: string | null;
}

export interface PlotThreadEvidenceSource {
  kind: "entity_mention" | "fact_source";
  entityId: string;
  entityName: string;
  excerpt: string | null;
  factId: string | null;
  factValue: string | null;
}

export interface PlotThreadCell {
  chapterId: string;
  signal: PlotThreadCellSignal;
  manual: boolean;
  evidence: boolean;
  evidenceCount: number;
  manualSources: PlotThreadManualSource[];
  evidenceSources: PlotThreadEvidenceSource[];
}

export interface PlotThreadRow {
  blockId: string;
  title: string;
  kind: string;
  pathLabel: string;
  cells: PlotThreadCell[];
}

export interface PlotThreadSummaryRow {
  cells: PlotThreadCell[];
}

export interface PlotThreadMatrix {
  threadId: string;
  title: string;
  summary: string | null;
  rows: PlotThreadRow[];
  summaryRow: PlotThreadSummaryRow;
  /** Chapter ids that carry any signal (summary or a row) — default column scope. */
  signalChapterIds: string[];
}

export interface PlotThreadSummary {
  id: string;
  title: string;
  summary: string | null;
  position: number;
  linkedBlockCount: number;
  connectedChapterCount: number;
}

export interface PlotThreadMatrixData {
  threads: PlotThreadSummary[];
  chapters: PlotThreadChapterColumn[];
  matrices: Record<string, PlotThreadMatrix>;
}

// ── Pure projection input ────────────────────────────────────────────────────

export interface AssembleThreadMatrixInput {
  threads: Array<{
    id: string;
    title: string;
    summary: string | null;
    position: number;
  }>;
  chapters: PlotThreadChapterColumn[];
  threadBlocks: Array<{ threadId: string; blockId: string; position: number }>;
  threadChapters: Array<{ threadId: string; chapterId: string }>;
  blocks: Array<{ id: string; title: string; kind: string; pathLabel: string }>;
  /** card → chapter PLANNED_FOR links */
  blockPlannedChapters: Array<{ blockId: string; chapterId: string }>;
  /** card → entity MEMORY_LINKED links (entity resolved to name) */
  blockEntities: Array<{
    blockId: string;
    entityId: string;
    entityName: string;
  }>;
  /** entity → chapter evidence from confirmed entity_suggestions */
  entityChapterEvidence: Array<{
    entityId: string;
    chapterId: string;
    excerpt: string | null;
  }>;
  /** entity → chapter evidence from approved canon fact sources */
  entityFactSources: Array<{
    entityId: string;
    chapterId: string;
    factId: string;
    factValue: string;
    excerpt: string | null;
  }>;
}

function signalFor(manual: boolean, evidence: boolean): PlotThreadCellSignal {
  if (manual && evidence) return "manual+evidence";
  if (manual) return "manual";
  if (evidence) return "evidence";
  return "empty";
}

/**
 * Pure: build a per-thread matrix from already-batched, normalized inputs.
 *
 * Decision contract (Evan, 2026-06-21):
 *  - thread↔chapter direct links are NOT repeated on every card row. They are
 *    aggregated into a single "스레드 연결 회차" summary row, together with the
 *    union of all card PLANNED_FOR links in the thread (one "작가 연결" marker
 *    per chapter; the inspector separates the sources).
 *  - each card row shows only that card's own PLANNED_FOR link (manual) and its
 *    own linked entity/fact evidence (evidence).
 *  - matrix rows are restricted to PLOT_THREAD_ROW_KINDS.
 *  - empty cells are never an error/drift state.
 */
export function assemblePlotThreadMatrices(
  input: AssembleThreadMatrixInput
): Record<string, PlotThreadMatrix> {
  const blockById = new Map(input.blocks.map((b) => [b.id, b]));

  // block → set(chapterId) of PLANNED_FOR
  const plannedByBlock = new Map<string, Set<string>>();
  for (const link of input.blockPlannedChapters) {
    const set = plannedByBlock.get(link.blockId) ?? new Set<string>();
    set.add(link.chapterId);
    plannedByBlock.set(link.blockId, set);
  }

  // block → entities
  const entitiesByBlock = new Map<
    string,
    Array<{ entityId: string; entityName: string }>
  >();
  for (const link of input.blockEntities) {
    const list = entitiesByBlock.get(link.blockId) ?? [];
    list.push({ entityId: link.entityId, entityName: link.entityName });
    entitiesByBlock.set(link.blockId, list);
  }

  // entity → chapter → mention excerpts
  const mentionByEntityChapter = new Map<string, string[]>();
  for (const ev of input.entityChapterEvidence) {
    const key = `${ev.entityId}::${ev.chapterId}`;
    const list = mentionByEntityChapter.get(key) ?? [];
    if (ev.excerpt) list.push(ev.excerpt);
    mentionByEntityChapter.set(key, list);
  }

  // entity → chapter → fact sources
  const factByEntityChapter = new Map<
    string,
    Array<{ factId: string; factValue: string; excerpt: string | null }>
  >();
  for (const fs of input.entityFactSources) {
    const key = `${fs.entityId}::${fs.chapterId}`;
    const list = factByEntityChapter.get(key) ?? [];
    list.push({
      factId: fs.factId,
      factValue: fs.factValue,
      excerpt: fs.excerpt,
    });
    factByEntityChapter.set(key, list);
  }

  // thread → ordered row blocks (restricted kinds only)
  const rowBlocksByThread = new Map<
    string,
    Array<{ blockId: string; position: number }>
  >();
  for (const tb of input.threadBlocks) {
    const block = blockById.get(tb.blockId);
    if (!block || !isPlotThreadRowKind(block.kind)) continue;
    const list = rowBlocksByThread.get(tb.threadId) ?? [];
    list.push({ blockId: tb.blockId, position: tb.position });
    rowBlocksByThread.set(tb.threadId, list);
  }

  // thread → set(chapterId) of direct thread links
  const threadChapterSet = new Map<string, Set<string>>();
  for (const tc of input.threadChapters) {
    const set = threadChapterSet.get(tc.threadId) ?? new Set<string>();
    set.add(tc.chapterId);
    threadChapterSet.set(tc.threadId, set);
  }

  const result: Record<string, PlotThreadMatrix> = {};

  for (const thread of input.threads) {
    const rowBlocks = (rowBlocksByThread.get(thread.id) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    const directChapters = threadChapterSet.get(thread.id) ?? new Set<string>();

    const signalChapterIds = new Set<string>();

    // ── card rows ──
    const rows: PlotThreadRow[] = rowBlocks.map(({ blockId }) => {
      const block = blockById.get(blockId)!;
      const planned = plannedByBlock.get(blockId) ?? new Set<string>();
      const entities = entitiesByBlock.get(blockId) ?? [];

      const cells: PlotThreadCell[] = input.chapters.map((chapter) => {
        const manual = planned.has(chapter.id);
        const manualSources: PlotThreadManualSource[] = manual
          ? [
              {
                kind: "card_planned_for",
                blockId,
                blockTitle: block.title,
              },
            ]
          : [];

        const evidenceSources: PlotThreadEvidenceSource[] = [];
        for (const ent of entities) {
          const key = `${ent.entityId}::${chapter.id}`;
          for (const excerpt of mentionByEntityChapter.get(key) ?? []) {
            evidenceSources.push({
              kind: "entity_mention",
              entityId: ent.entityId,
              entityName: ent.entityName,
              excerpt,
              factId: null,
              factValue: null,
            });
          }
          for (const fact of factByEntityChapter.get(key) ?? []) {
            evidenceSources.push({
              kind: "fact_source",
              entityId: ent.entityId,
              entityName: ent.entityName,
              excerpt: fact.excerpt,
              factId: fact.factId,
              factValue: fact.factValue,
            });
          }
        }
        const evidence = evidenceSources.length > 0;
        if (manual || evidence) signalChapterIds.add(chapter.id);

        return {
          chapterId: chapter.id,
          signal: signalFor(manual, evidence),
          manual,
          evidence,
          evidenceCount: evidenceSources.length,
          manualSources,
          evidenceSources,
        };
      });

      return {
        blockId,
        title: block.title,
        kind: block.kind,
        pathLabel: block.pathLabel,
        cells,
      };
    });

    // ── summary row: union of thread-level chapter links + all card PLANNED_FOR ──
    const summaryCells: PlotThreadCell[] = input.chapters.map((chapter) => {
      const manualSources: PlotThreadManualSource[] = [];
      if (directChapters.has(chapter.id)) {
        manualSources.push({
          kind: "thread_chapter",
          blockId: null,
          blockTitle: null,
        });
      }
      for (const { blockId } of rowBlocks) {
        const planned = plannedByBlock.get(blockId);
        if (planned?.has(chapter.id)) {
          const block = blockById.get(blockId)!;
          manualSources.push({
            kind: "card_planned_for",
            blockId,
            blockTitle: block.title,
          });
        }
      }
      const manual = manualSources.length > 0;
      if (manual) signalChapterIds.add(chapter.id);
      return {
        chapterId: chapter.id,
        signal: signalFor(manual, false),
        manual,
        evidence: false,
        evidenceCount: 0,
        manualSources,
        evidenceSources: [],
      };
    });

    result[thread.id] = {
      threadId: thread.id,
      title: thread.title,
      summary: thread.summary,
      rows,
      summaryRow: { cells: summaryCells },
      signalChapterIds: input.chapters
        .filter((c) => signalChapterIds.has(c.id))
        .map((c) => c.id),
    };
  }

  return result;
}

function throwReadError(label: string, error: { message: string }): never {
  throw new Error(`${label} 정보를 불러오지 못했습니다: ${error.message}`);
}

/**
 * Batch read model for the plot-thread matrix. All queries are project- or
 * id-set-scoped (`.in`/`.eq`); there is no per-cell, per-entity, or per-source
 * query. `chapters` is passed in by the page (already fetched) to avoid refetch.
 */
export async function getPlotThreadMatrixData(
  supabase: SupabaseClient,
  projectId: string,
  chapters: PlotThreadChapterColumn[]
): Promise<PlotThreadMatrixData> {
  const [
    { data: threads, error: threadsError },
    { data: threadBlockRows, error: threadBlocksError },
    { data: threadChapterRows, error: threadChaptersError },
  ] = await Promise.all([
    supabase
      .from("plot_threads")
      .select("id, title, summary, position, created_at")
      .eq("project_id", projectId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("plot_thread_planning_blocks")
      .select("plot_thread_id, planning_block_id, position")
      .eq("project_id", projectId),
    supabase
      .from("plot_thread_chapters")
      .select("plot_thread_id, chapter_id")
      .eq("project_id", projectId),
  ]);

  if (threadsError) throwReadError("플롯 스레드", threadsError);
  if (threadBlocksError) throwReadError("스레드 카드 연결", threadBlocksError);
  if (threadChaptersError) throwReadError("스레드 회차 연결", threadChaptersError);

  const threadRows = (threads ?? []) as Array<{
    id: string;
    title: string;
    summary: string | null;
    position: number;
  }>;

  if (threadRows.length === 0) {
    return { threads: [], chapters, matrices: {} };
  }

  const threadBlocks = ((threadBlockRows ?? []) as Array<{
    plot_thread_id: string;
    planning_block_id: string;
    position: number;
  }>).map((r) => ({
    threadId: r.plot_thread_id,
    blockId: r.planning_block_id,
    position: r.position,
  }));

  const threadChapters = ((threadChapterRows ?? []) as Array<{
    plot_thread_id: string;
    chapter_id: string;
  }>).map((r) => ({ threadId: r.plot_thread_id, chapterId: r.chapter_id }));

  const linkedBlockIds = Array.from(
    new Set(threadBlocks.map((tb) => tb.blockId))
  );

  // planning_blocks for path labels + kind; one project-scoped query.
  const { data: allBlockRows, error: blocksError } = await supabase
    .from("planning_blocks")
    .select("id, parent_id, title, kind")
    .eq("project_id", projectId);
  if (blocksError) throwReadError("구상 카드", blocksError);

  const allBlocks = (allBlockRows ?? []) as Array<{
    id: string;
    parent_id: string | null;
    title: string;
    kind: string;
  }>;
  const allBlockById = new Map(allBlocks.map((b) => [b.id, b]));

  function pathLabelFor(blockId: string): string {
    const titles: string[] = [];
    let current = allBlockById.get(blockId);
    let guard = 0;
    while (current && guard < 32) {
      titles.unshift(current.title);
      current = current.parent_id
        ? allBlockById.get(current.parent_id)
        : undefined;
      guard += 1;
    }
    return titles.join(" / ");
  }

  const blocks = linkedBlockIds
    .map((id) => allBlockById.get(id))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))
    .map((b) => ({
      id: b.id,
      title: b.title,
      kind: b.kind,
      pathLabel: pathLabelFor(b.id),
    }));

  // PLANNED_FOR chapter links + MEMORY_LINKED entity links for linked blocks.
  let blockPlannedChapters: AssembleThreadMatrixInput["blockPlannedChapters"] =
    [];
  let blockEntities: AssembleThreadMatrixInput["blockEntities"] = [];
  let entityChapterEvidence: AssembleThreadMatrixInput["entityChapterEvidence"] =
    [];
  const entityFactSources: AssembleThreadMatrixInput["entityFactSources"] = [];

  if (linkedBlockIds.length > 0) {
    const [
      { data: plannedLinks, error: plannedError },
      { data: entityLinks, error: entityLinksError },
    ] = await Promise.all([
      supabase
        .from("planning_links")
        .select("planning_block_id, target_id")
        .eq("project_id", projectId)
        .eq("target_type", "chapter")
        .eq("link_kind", "PLANNED_FOR")
        .in("planning_block_id", linkedBlockIds),
      supabase
        .from("planning_links")
        .select("planning_block_id, target_id")
        .eq("project_id", projectId)
        .eq("target_type", "entity")
        .eq("link_kind", "MEMORY_LINKED")
        .in("planning_block_id", linkedBlockIds),
    ]);

    if (plannedError) throwReadError("회차 연결", plannedError);
    if (entityLinksError) throwReadError("작품 기억 연결", entityLinksError);

    blockPlannedChapters = ((plannedLinks ?? []) as Array<{
      planning_block_id: string;
      target_id: string;
    }>).map((r) => ({ blockId: r.planning_block_id, chapterId: r.target_id }));

    const entityLinkRows = ((entityLinks ?? []) as Array<{
      planning_block_id: string;
      target_id: string;
    }>).map((r) => ({ blockId: r.planning_block_id, entityId: r.target_id }));

    const linkedEntityIds = Array.from(
      new Set(entityLinkRows.map((r) => r.entityId))
    );

    if (linkedEntityIds.length > 0) {
      const chapterNumById = new Map(
        chapters.map((c) => [c.id, c.chapterNum])
      );

      const [{ data: entityRows, error: entError }, factsByEntity] =
        await Promise.all([
          supabase
            .from("entities")
            .select("id, name")
            .eq("project_id", projectId)
            .in("id", linkedEntityIds),
          listApprovedCodexFactsByEntity(supabase, projectId, linkedEntityIds),
        ]);

      if (entError) throwReadError("작품 기억", entError);

      const entityNameById = new Map(
        ((entityRows ?? []) as Array<{ id: string; name: string }>).map((e) => [
          e.id,
          e.name,
        ])
      );

      blockEntities = entityLinkRows
        .filter((r) => entityNameById.has(r.entityId))
        .map((r) => ({
          blockId: r.blockId,
          entityId: r.entityId,
          entityName: entityNameById.get(r.entityId)!,
        }));

      // entity → chapter evidence from confirmed suggestions (same source the
      // Codex read model uses for "원문 근거").
      const { data: suggestionRows, error: sugError } = await supabase
        .from("entity_suggestions")
        .select("matched_entity_id, chapter_id, context_snippet")
        .eq("project_id", projectId)
        .eq("status", "CONFIRMED")
        .not("matched_entity_id", "is", null)
        .in("matched_entity_id", linkedEntityIds);

      if (sugError) throwReadError("원문 근거", sugError);

      entityChapterEvidence = ((suggestionRows ?? []) as Array<{
        matched_entity_id: string | null;
        chapter_id: string;
        context_snippet: string | null;
      }>)
        .filter(
          (r) => r.matched_entity_id && chapterNumById.has(r.chapter_id)
        )
        .map((r) => ({
          entityId: r.matched_entity_id as string,
          chapterId: r.chapter_id,
          excerpt: r.context_snippet,
        }));

      // approved fact sources → chapter evidence
      for (const [entityId, facts] of Object.entries(factsByEntity)) {
        for (const fact of facts) {
          for (const source of fact.sources) {
            if (!source.chapterId || !chapterNumById.has(source.chapterId)) {
              continue;
            }
            entityFactSources.push({
              entityId,
              chapterId: source.chapterId,
              factId: fact.id,
              factValue: fact.value,
              excerpt: source.evidenceText,
            });
          }
        }
      }
    }
  }

  const matrices = assemblePlotThreadMatrices({
    threads: threadRows,
    chapters,
    threadBlocks,
    threadChapters,
    blocks,
    blockPlannedChapters,
    blockEntities,
    entityChapterEvidence,
    entityFactSources,
  });

  const threadSummaries: PlotThreadSummary[] = threadRows.map((t) => {
    const matrix = matrices[t.id];
    const connected = new Set<string>();
    for (const cell of matrix?.summaryRow.cells ?? []) {
      if (cell.manual) connected.add(cell.chapterId);
    }
    return {
      id: t.id,
      title: t.title,
      summary: t.summary,
      position: t.position,
      linkedBlockCount: matrix?.rows.length ?? 0,
      connectedChapterCount: connected.size,
    };
  });

  return { threads: threadSummaries, chapters, matrices };
}
