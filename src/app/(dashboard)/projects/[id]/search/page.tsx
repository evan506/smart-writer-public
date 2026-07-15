import { PageHeader } from "@/components/page-header";
import { CanonQAPanel } from "@/components/canon-qa-panel";
import { RAGSearchPanel } from "@/components/rag-search-panel";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: projectId } = await params;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="작품 기억 검색"
        description="작가가 승인한 Codex 정보와 원문 근거를 중심으로 인물, 장소, 사건, 대사를 다시 찾습니다"
      />
      <div className="flex-1 p-6">
        <div className="space-y-6">
          <CanonQAPanel projectId={projectId} />
          <RAGSearchPanel projectId={projectId} />
        </div>
      </div>
    </div>
  );
}
