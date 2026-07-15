import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPlanningBlocks } from "@/app/(dashboard)/projects/[id]/planning-actions";
import { PlanningViewShell } from "@/components/planning/planning-view-shell";
import { getPlanningMemoryContext } from "@/lib/services/planning/read.service";
import { getPlotThreadMatrixData } from "@/lib/services/plot-thread/read.service";

export const dynamic = "force-dynamic";

export default async function PlanningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!project) notFound();

  const { blocks, error } = await getPlanningBlocks(id);
  const { data: chapters } = await supabase
    .from("chapters")
    .select("id, chapter_num, title, updated_at")
    .eq("project_id", id)
    .order("chapter_num", { ascending: true });

  const matrixChapters = (chapters ?? []).map((c) => ({
    id: c.id,
    chapterNum: c.chapter_num,
    title: c.title,
  }));

  const [{ data: chapterLinks }, memoryContext, plotThreadData] =
    await Promise.all([
      supabase
        .from("planning_links")
        .select("id, planning_block_id, target_id")
        .eq("project_id", id)
        .eq("target_type", "chapter")
        .eq("link_kind", "PLANNED_FOR"),
      getPlanningMemoryContext(supabase, id),
      getPlotThreadMatrixData(supabase, id, matrixChapters),
    ]);

  if (error) {
    return (
      <div className="min-h-screen bg-sw-bg-base px-4 py-8 text-sw-text-primary sm:px-6">
        <div className="max-w-2xl rounded-lg border border-sw-border-default bg-sw-bg-surface p-5 shadow-[0_18px_46px_rgba(61,43,22,0.08)]">
          <p className="text-xs font-bold text-sw-accent">소설 구상 보조</p>
          <h1 className="mt-2 text-2xl font-bold">구상하기</h1>
          <p className="mt-3 rounded-md border border-sw-danger bg-sw-bg-elevated px-4 py-3 text-sm leading-6 text-sw-danger">
            {error}
          </p>
          <Link
            href={`/projects/${id}`}
            className="mt-4 inline-flex min-h-9 items-center rounded-md border border-sw-border-default bg-sw-bg-elevated px-3 text-sm font-bold text-sw-text-muted hover:border-sw-accent-border hover:text-sw-accent"
          >
            프로젝트로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <PlanningViewShell
      projectId={id}
      projectTitle={project.title}
      initialBlocks={blocks}
      chapters={chapters ?? []}
      chapterReferences={chapterLinks ?? []}
      availableEntities={memoryContext.availableEntities}
      entityReferences={memoryContext.entityLinks}
      linkedEntities={memoryContext.linkedEntities}
      factsByEntityId={memoryContext.factsByEntityId}
      plotThreads={plotThreadData.threads}
      plotThreadMatrices={plotThreadData.matrices}
    />
  );
}
