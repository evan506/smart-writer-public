import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getExtractionMemory } from "@/app/(dashboard)/projects/[id]/extraction-memory-actions";
import { ExtractionMemoryPanel } from "@/components/extraction-memory-panel";
import { PageHeader } from "@/components/page-header";

export const dynamic = "force-dynamic";

export default async function ExtractionMemoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const projectRes = await supabase
    .from("projects")
    .select("id, title")
    .eq("id", id)
    .single();

  if (!projectRes.data) notFound();

  const { error, panel, metrics } = await getExtractionMemory(id);
  if (error) notFound();

  return (
    <div className="min-h-screen" style={{ background: "var(--sw-bg-base)" }}>
      <PageHeader
        title="추출 학습 메모리"
        description={`${projectRes.data.title} · 추출 도구가 이 작품에 맞게 학습한 규칙을 확인하고 관리합니다.`}
      />
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        <ExtractionMemoryPanel projectId={id} initial={panel} metrics={metrics} />
      </div>
    </div>
  );
}
