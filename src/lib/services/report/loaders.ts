import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Chapter,
  Entity,
  EntityLink,
  EntitySuggestion,
  Foreshadow,
  Mention,
  Project,
} from "@/types";
import type { Database } from "@/types/database.types";
import type { AnalysisJob, ReportChunkSource, ReportDataOptions } from "./types";

export async function loadReportProject(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (error) throw new Error(`리포트 프로젝트 조회 실패: ${error.message}`);
  return data as Project;
}

export async function loadReportChapters(
  supabase: SupabaseClient<Database>,
  projectId: string,
  options: ReportDataOptions
): Promise<Chapter[]> {
  let query = supabase
    .from("chapters")
    .select("*")
    .eq("project_id", projectId)
    .order("chapter_num", { ascending: true });

  if (options.chapterFrom !== undefined) {
    query = query.gte("chapter_num", options.chapterFrom);
  }

  if (options.chapterTo !== undefined) {
    query = query.lte("chapter_num", options.chapterTo);
  }

  const { data, error } = await query;
  if (error) throw new Error(`리포트 회차 조회 실패: ${error.message}`);
  return (data ?? []) as Chapter[];
}

export async function loadReportEntities(
  supabase: SupabaseClient<Database>,
  projectId: string
): Promise<Entity[]> {
  const { data, error } = await supabase
    .from("entities")
    .select("*")
    .eq("project_id", projectId)
    .order("type", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw new Error(`리포트 작품 기억 조회 실패: ${error.message}`);
  return (data ?? []) as Entity[];
}

export async function loadReportSuggestions(
  supabase: SupabaseClient<Database>,
  projectId: string,
  chapterIds: string[]
): Promise<EntitySuggestion[]> {
  if (chapterIds.length === 0) return [];

  const query = supabase
    .from("entity_suggestions")
    .select("*")
    .eq("project_id", projectId)
    .in("chapter_id", chapterIds)
    .order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(`리포트 확인 후보 조회 실패: ${error.message}`);
  return (data ?? []) as EntitySuggestion[];
}

export async function loadReportForeshadows(
  supabase: SupabaseClient<Database>,
  projectId: string,
  options: ReportDataOptions
): Promise<Foreshadow[]> {
  let query = supabase
    .from("foreshadows")
    .select("*")
    .eq("project_id", projectId)
    .order("planted_chapter", { ascending: true });

  if (options.chapterFrom !== undefined) {
    query = query.gte("planted_chapter", options.chapterFrom);
  }

  if (options.chapterTo !== undefined) {
    query = query.lte("planted_chapter", options.chapterTo);
  }

  const { data, error } = await query;
  if (error) throw new Error(`리포트 복선 조회 실패: ${error.message}`);
  return (data ?? []) as Foreshadow[];
}

export async function loadReportAnalysisJobs(
  supabase: SupabaseClient<Database>,
  projectId: string,
  chapterIds: string[]
): Promise<AnalysisJob[]> {
  if (chapterIds.length === 0) return [];

  const query = supabase
    .from("analysis_jobs")
    .select("*")
    .eq("project_id", projectId)
    .in("chapter_id", chapterIds)
    .order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`리포트 분석 상태 조회 실패: ${error.message}`);
  return (data ?? []) as AnalysisJob[];
}

export async function loadReportChunks(
  supabase: SupabaseClient<Database>,
  chapterIds: string[]
): Promise<ReportChunkSource[]> {
  if (chapterIds.length === 0) return [];

  const { data, error } = await supabase
    .from("chunks")
    .select("id, chapter_id, content, created_at, entity_tags, position, summary, type")
    .in("chapter_id", chapterIds)
    .order("position", { ascending: true });

  if (error) throw new Error(`리포트 근거 장면 조회 실패: ${error.message}`);
  return (data ?? []) as ReportChunkSource[];
}

export async function loadReportMentions(
  supabase: SupabaseClient<Database>,
  chunkIds: string[]
): Promise<Mention[]> {
  if (chunkIds.length === 0) return [];

  const { data, error } = await supabase
    .from("mentions")
    .select("*")
    .in("chunk_id", chunkIds);

  if (error) throw new Error(`리포트 등장 근거 조회 실패: ${error.message}`);
  return (data ?? []) as Mention[];
}

export async function loadReportEntityLinks(
  supabase: SupabaseClient<Database>,
  entityIds: string[]
): Promise<EntityLink[]> {
  if (entityIds.length === 0) return [];

  const { data, error } = await supabase
    .from("entity_links")
    .select("*")
    .in("from_id", entityIds)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`리포트 관계 조회 실패: ${error.message}`);

  return ((data ?? []) as EntityLink[]).filter((link) =>
    entityIds.includes(link.to_id)
  );
}
