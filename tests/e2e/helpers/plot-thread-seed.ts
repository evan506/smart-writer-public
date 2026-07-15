import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../src/types/database.types";

// ─────────────────────────────────────────────────────────────────────────────
// V3.3 plot-thread matrix — deterministic E2E fixture.
//
// Design (Discovery+Planning approved 2026-06-22):
//  - Reuses the e2e-data-policy naming: user `smartwriter.e2e.v33.<stamp>@…`,
//    project title carries the ` E2E ` token. Cleanup deletes the project
//    (cascade) + the auth user, so a single owner isolates the whole fixture.
//  - Evidence is seeded WITHOUT any LLM. The matrix lights up purely from
//    existing planning/codex rows (see src/lib/services/plot-thread/read.service.ts):
//      • "작가 연결" (manual)  ← planning_links PLANNED_FOR (card → chapter)
//      • "원문 근거" (evidence)← card → entity (MEMORY_LINKED) + entity → chapter
//        evidence from a CONFIRMED entity_suggestion and/or an APPROVED canon_fact
//        + canon_fact_source.
//  - The plot thread itself, its title/summary edits, and all thread↔card /
//    thread↔chapter links are created by the BROWSER during the test (the user
//    journey), never pre-seeded.
//
// The remote guard lives in the caller (tests reuse getAuthE2EEnv from
// ./auth-seed; the CLI re-implements the same env contract). This module never
// decides whether remote writes are allowed — it only takes a resolved env.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlotThreadE2EEnv {
  url: string;
  serviceKey: string;
}

export interface PlotThreadSeed {
  stamp: number;
  email: string;
  password: string;
  userId: string;
  projectId: string;
  projectTitle: string;
  chapters: Array<{ id: string; num: number; title: string }>;
  rootBlockId: string;
  episodeBlockId: string; // allowed kind (EPISODE) — has PLANNED_FOR(ch2) + MEMORY_LINKED(리엔)
  sceneBlockId: string; // allowed kind (SCENE) — no evidence, for the second link/unlink
  characterPlanBlockId: string; // disallowed kind — must NOT appear in the link dropdown
  episodeTitle: string;
  sceneTitle: string;
  characterPlanTitle: string;
  entityIds: { rien: string; theo: string };
  excerptCh2: string;
  excerptCh3: string;
  factValue: string;
  factExcerptCh3: string;
}

const PASSWORD = "SmartWriter-v33-e2e-1234!";

// Real lines from references/test-data/blackiron (fixtures are canonical). These are
// reused as the seeded evidence excerpts so the inspector shows authentic text.
const EXCERPT_CH2 = "미라가 경악한 눈으로 바라보자 리엔은 당황했다.";
const EXCERPT_CH3 = "테오를 집에 들여도 리엔의 일상은 변함이 없었다.";
const FACT_VALUE = "끝없는 마족 침공에 지쳐 있다";
const FACT_EXCERPT_CH3 = "끝도 없는 마족의 침공은 리엔을 지치게 만들었다.";

/** Manual `.env.local` loader (no dotenv dependency) — mirrors scripts/e2e-seed.ts. */
export function loadEnvLocal() {
  try {
    const envPath = resolve(process.cwd(), ".env.local");
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] ??= value;
    }
  } catch {
    // .env.local is optional; env may already be exported in the shell.
  }
}

function service(env: PlotThreadE2EEnv): SupabaseClient<Database> {
  return createClient<Database>(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function readBlackironChapter(num: number): string {
  return readFileSync(
    resolve(process.cwd(), `references/test-data/blackiron/ch${num}.md`),
    "utf-8"
  )
    .replace(/^﻿/, "")
    .trim();
}

export async function seedPlotThreadE2E(
  env: PlotThreadE2EEnv
): Promise<PlotThreadSeed> {
  const db = service(env);
  const stamp = Date.now();
  const email = `smartwriter.e2e.v33.${stamp}@example.com`;
  const projectTitle = `플롯 스레드 E2E ${stamp}`;

  // 1) owner
  const { data: userData, error: userError } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError) throw userError;
  const userId = userData.user.id;

  // 2) project
  const { data: project, error: projectError } = await db
    .from("projects")
    .insert({
      user_id: userId,
      title: projectTitle,
      genre: "판타지",
      description: "v3.3 plot-thread matrix e2e fixture",
      metadata: { testRun: "v3_3-plot-thread", stamp },
    })
    .select("id")
    .single();
  if (projectError) throw projectError;
  const projectId = project.id;

  // 3) four adjacent blackiron chapters (canonical bodies)
  const chapterRows = [1, 2, 3, 4].map((num) => {
    const content = readBlackironChapter(num);
    return {
      project_id: projectId,
      chapter_num: num,
      title: `제${num}화`,
      content,
      word_count: content.replace(/\s/g, "").length,
    };
  });
  const { data: chapters, error: chaptersError } = await db
    .from("chapters")
    .insert(chapterRows)
    .select("id, chapter_num, title");
  if (chaptersError) throw chaptersError;
  if (!chapters) throw new Error("failed to seed chapters");
  const chapterByNum = new Map(chapters.map((c) => [c.chapter_num, c]));
  const ch2 = chapterByNum.get(2)!;
  const ch3 = chapterByNum.get(3)!;

  // 4) entities
  const { data: entities, error: entityError } = await db
    .from("entities")
    .insert([
      {
        project_id: projectId,
        name: "리엔",
        type: "CHARACTER",
        summary: "v3.3 e2e 주인공 수비대장",
        aliases: [],
        metadata: { importance: "MAIN" },
      },
      {
        project_id: projectId,
        name: "테오",
        type: "CHARACTER",
        summary: "v3.3 e2e 자칭 마왕 아이",
        aliases: [],
        metadata: { importance: "SUPPORTING" },
      },
    ])
    .select("id, name");
  if (entityError) throw entityError;
  if (!entities) throw new Error("failed to seed entities");
  const rien = entities.find((e) => e.name === "리엔")!.id;
  const theo = entities.find((e) => e.name === "테오")!.id;

  // 5) planning blocks: ROOT + EPISODE + SCENE (allowed) + CHARACTER_PLAN (disallowed)
  const episodeTitle = "암살 음모의 시작";
  const sceneTitle = "독배 장면";
  const characterPlanTitle = "리엔 인물 카드";
  const { data: root, error: rootError } = await db
    .from("planning_blocks")
    .insert({
      project_id: projectId,
      parent_id: null,
      kind: "ROOT",
      title: "전체 구상",
    })
    .select("id")
    .single();
  if (rootError) throw rootError;
  const rootBlockId = root.id;

  const { data: childBlocks, error: childError } = await db
    .from("planning_blocks")
    .insert([
      {
        project_id: projectId,
        parent_id: rootBlockId,
        kind: "EPISODE",
        title: episodeTitle,
        position: 0,
      },
      {
        project_id: projectId,
        parent_id: rootBlockId,
        kind: "SCENE",
        title: sceneTitle,
        position: 1,
      },
      {
        project_id: projectId,
        parent_id: rootBlockId,
        kind: "CHARACTER_PLAN",
        title: characterPlanTitle,
        position: 2,
      },
    ])
    .select("id, kind");
  if (childError) throw childError;
  if (!childBlocks) throw new Error("failed to seed planning blocks");
  const episodeBlockId = childBlocks.find((b) => b.kind === "EPISODE")!.id;
  const sceneBlockId = childBlocks.find((b) => b.kind === "SCENE")!.id;
  const characterPlanBlockId = childBlocks.find(
    (b) => b.kind === "CHARACTER_PLAN"
  )!.id;

  // 6) planning links — EPISODE card → ch2 (PLANNED_FOR / manual) + → 리엔 (MEMORY_LINKED)
  const { error: linkError } = await db.from("planning_links").insert([
    {
      project_id: projectId,
      planning_block_id: episodeBlockId,
      target_type: "chapter",
      target_id: ch2.id,
      link_kind: "PLANNED_FOR",
    },
    {
      project_id: projectId,
      planning_block_id: episodeBlockId,
      target_type: "entity",
      target_id: rien,
      link_kind: "MEMORY_LINKED",
    },
  ]);
  if (linkError) throw linkError;

  // 7) CONFIRMED entity_suggestions → 리엔 evidence in ch2 and ch3 (entity_mention)
  const { error: sugError } = await db.from("entity_suggestions").insert([
    {
      project_id: projectId,
      chapter_id: ch2.id,
      matched_entity_id: rien,
      name: "리엔",
      type: "CHARACTER",
      summary: "ch2 등장",
      aliases: [],
      confidence: 0.92,
      context_snippet: EXCERPT_CH2,
      status: "CONFIRMED",
      suggested_action: "MERGE",
    },
    {
      project_id: projectId,
      chapter_id: ch3.id,
      matched_entity_id: rien,
      name: "리엔",
      type: "CHARACTER",
      summary: "ch3 등장",
      aliases: [],
      confidence: 0.9,
      context_snippet: EXCERPT_CH3,
      status: "CONFIRMED",
      suggested_action: "MERGE",
    },
  ]);
  if (sugError) throw sugError;

  // 8) APPROVED canon_fact for 리엔 + a ch3 fact source (fact_source evidence)
  const { data: fact, error: factError } = await db
    .from("canon_facts")
    .insert({
      project_id: projectId,
      entity_id: rien,
      fact_type: "STATE",
      fact_key: "morale",
      value: FACT_VALUE,
      status: "APPROVED",
      confidence: 0.88,
      established_chapter_id: ch3.id,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (factError) throw factError;
  const { error: factSourceError } = await db
    .from("canon_fact_sources")
    .insert({
      fact_id: fact.id,
      chapter_id: ch3.id,
      evidence_text: FACT_EXCERPT_CH3,
      evidence_kind: "DIRECT",
    });
  if (factSourceError) throw factSourceError;

  return {
    stamp,
    email,
    password: PASSWORD,
    userId,
    projectId,
    projectTitle,
    chapters: chapters
      .map((c) => ({ id: c.id, num: c.chapter_num, title: c.title ?? "" }))
      .sort((a, b) => a.num - b.num),
    rootBlockId,
    episodeBlockId,
    sceneBlockId,
    characterPlanBlockId,
    episodeTitle,
    sceneTitle,
    characterPlanTitle,
    entityIds: { rien, theo },
    excerptCh2: EXCERPT_CH2,
    excerptCh3: EXCERPT_CH3,
    factValue: FACT_VALUE,
    factExcerptCh3: FACT_EXCERPT_CH3,
  };
}

// ── State readers + invariants (DB-layer assertions) ─────────────────────────

export interface PlotThreadState {
  threads: Array<{ id: string; title: string; summary: string | null }>;
  blockLinks: Array<{ plot_thread_id: string; planning_block_id: string }>;
  chapterLinks: Array<{ plot_thread_id: string; chapter_id: string }>;
}

export async function readPlotThreadState(
  env: PlotThreadE2EEnv,
  projectId: string
): Promise<PlotThreadState> {
  const db = service(env);
  const [threads, blockLinks, chapterLinks] = await Promise.all([
    db
      .from("plot_threads")
      .select("id, title, summary")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    db
      .from("plot_thread_planning_blocks")
      .select("plot_thread_id, planning_block_id")
      .eq("project_id", projectId),
    db
      .from("plot_thread_chapters")
      .select("plot_thread_id, chapter_id")
      .eq("project_id", projectId),
  ]);
  return {
    threads: (threads.data ?? []) as PlotThreadState["threads"],
    blockLinks: (blockLinks.data ?? []) as PlotThreadState["blockLinks"],
    chapterLinks: (chapterLinks.data ?? []) as PlotThreadState["chapterLinks"],
  };
}

/**
 * Stable fingerprint of every NON-plot-thread table the matrix reads from, so a
 * before/after comparison proves the journey did not auto-mutate planning,
 * manuscript, or codex data.
 */
export async function snapshotImmutableTables(
  env: PlotThreadE2EEnv,
  projectId: string
): Promise<string> {
  const db = service(env);
  const [blocks, links, chapters, entities, facts, factSources, suggestions] =
    await Promise.all([
      db
        .from("planning_blocks")
        .select("id, kind, title, parent_id, status, position, updated_at")
        .eq("project_id", projectId)
        .order("id"),
      db
        .from("planning_links")
        .select("id, planning_block_id, target_type, target_id, link_kind")
        .eq("project_id", projectId)
        .order("id"),
      db
        .from("chapters")
        .select("id, chapter_num, title, content, updated_at")
        .eq("project_id", projectId)
        .order("id"),
      db
        .from("entities")
        .select("id, name, type, summary, updated_at")
        .eq("project_id", projectId)
        .order("id"),
      db
        .from("canon_facts")
        .select("id, entity_id, fact_type, value, status, updated_at")
        .eq("project_id", projectId)
        .order("id"),
      db
        .from("canon_fact_sources")
        .select("id, fact_id, chapter_id, evidence_text, evidence_kind")
        .order("id"),
      db
        .from("entity_suggestions")
        .select("id, matched_entity_id, chapter_id, status, context_snippet")
        .eq("project_id", projectId)
        .order("id"),
    ]);
  return JSON.stringify({
    blocks: blocks.data,
    links: links.data,
    chapters: chapters.data,
    entities: entities.data,
    facts: facts.data,
    factSources: (factSources.data ?? []).filter((s) =>
      (facts.data ?? []).some((f) => f.id === s.fact_id)
    ),
    suggestions: suggestions.data,
  });
}

export interface GlobalPlotThreadCounts {
  threads: number;
  blockLinks: number;
  chapterLinks: number;
}

/** Global (all-tenant) row counts for blast-radius: must be equal pre-seed vs post-cleanup. */
export async function globalPlotThreadCounts(
  env: PlotThreadE2EEnv
): Promise<GlobalPlotThreadCounts> {
  const db = service(env);
  const [t, b, c] = await Promise.all([
    db.from("plot_threads").select("*", { count: "exact", head: true }),
    db
      .from("plot_thread_planning_blocks")
      .select("*", { count: "exact", head: true }),
    db.from("plot_thread_chapters").select("*", { count: "exact", head: true }),
  ]);
  return {
    threads: t.count ?? 0,
    blockLinks: b.count ?? 0,
    chapterLinks: c.count ?? 0,
  };
}

export interface ResidueReport {
  projects: number;
  threads: number;
  blockLinks: number;
  chapterLinks: number;
}

/** Per-fixture residue: everything project-scoped must be 0 after cleanup. */
export async function residueForProject(
  env: PlotThreadE2EEnv,
  projectId: string,
  stamp: number
): Promise<ResidueReport> {
  const db = service(env);
  const [projects, threads, blockLinks, chapterLinks] = await Promise.all([
    db
      .from("projects")
      .select("*", { count: "exact", head: true })
      .eq("id", projectId),
    db
      .from("plot_threads")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId),
    db
      .from("plot_thread_planning_blocks")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId),
    db
      .from("plot_thread_chapters")
      .select("*", { count: "exact", head: true })
      .eq("project_id", projectId),
  ]);
  void stamp;
  return {
    projects: projects.count ?? 0,
    threads: threads.count ?? 0,
    blockLinks: blockLinks.count ?? 0,
    chapterLinks: chapterLinks.count ?? 0,
  };
}

export async function cleanupPlotThreadE2E(
  env: PlotThreadE2EEnv,
  ids: { projectId?: string; userId?: string } | null
) {
  if (!ids) return;
  const db = service(env);
  if (ids.projectId) {
    await db.from("projects").delete().eq("id", ids.projectId);
  }
  if (ids.userId) {
    await db.auth.admin.deleteUser(ids.userId);
  }
}
