import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WriteWorkspace } from "@/components/write/write-workspace";
import type { Chapter, Project } from "@/types";

export const dynamic = "force-dynamic";

export default async function WritePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chapter?: string }>;
}) {
  const { id: projectId } = await params;
  const { chapter: requestedChapterId } = await searchParams;
  const supabase = await createClient();

  const [{ data: project }, { data: chapters }] = await Promise.all([
    supabase.from("projects").select("*").eq("id", projectId).single(),
    supabase
      .from("chapters")
      .select("*")
      .eq("project_id", projectId)
      .order("chapter_num", { ascending: true }),
  ]);

  if (!project) {
    notFound();
  }

  const typedChapters = (chapters as Chapter[]) ?? [];
  const hasRequestedChapter =
    requestedChapterId &&
    typedChapters.some((chapter) => chapter.id === requestedChapterId);

  if (typedChapters.length > 0 && !hasRequestedChapter) {
    const [defaultChapter] = [...typedChapters].sort((a, b) => {
      const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.chapter_num - b.chapter_num;
    });
    redirect(`/projects/${projectId}/write?chapter=${defaultChapter.id}`);
  }

  return (
    <WriteWorkspace
      projectId={projectId}
      projectName={(project as Project).title}
      projectGenre={(project as Project).genre}
      initialChapters={typedChapters}
    />
  );
}
