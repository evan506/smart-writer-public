import Link from "next/link";
import { FileText, RotateCw } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ReportPreviewCopyButton } from "@/components/report-preview-copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getProjectReportMarkdown } from "@/app/(dashboard)/projects/[id]/report-actions";

export const dynamic = "force-dynamic";

function parseChapterParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default async function ReportPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
    operatorNotes?: string;
  }>;
}) {
  const { id: projectId } = await params;
  const { from, to, operatorNotes } = await searchParams;
  const chapterFrom = parseChapterParam(from);
  const chapterTo = parseChapterParam(to);
  const includeOperatorNotes = operatorNotes !== "false";

  const { markdown, error } = await getProjectReportMarkdown(projectId, {
    chapterFrom,
    chapterTo,
    includeOperatorNotes,
  });

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-sw-bg-base text-sw-text-primary">
      <PageHeader
        title="내부 리포트 초안 Preview"
        description="운영자가 검수할 Markdown 초안을 확인합니다. 작가용 공개 화면과 리포트 MVP는 보류 상태입니다."
      >
        {markdown && <ReportPreviewCopyButton markdown={markdown} />}
      </PageHeader>

      <div className="flex-1 space-y-4 p-6">
        <form
          method="get"
          className="grid gap-3 rounded-lg border border-sw-border-default bg-sw-bg-surface p-4 text-sm md:grid-cols-[minmax(0,160px)_minmax(0,160px)_minmax(0,180px)_auto]"
        >
          <label className="space-y-1">
            <span className="text-xs font-medium text-sw-text-secondary">
              시작 회차
            </span>
            <Input
              name="from"
              type="number"
              min={1}
              defaultValue={chapterFrom ?? ""}
              placeholder="첫 화"
              className="border-sw-border-default bg-sw-bg-elevated text-sw-text-primary placeholder:text-sw-text-muted focus-visible:border-sw-border-focus focus-visible:ring-sw-border-focus/40"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-sw-text-secondary">
              종료 회차
            </span>
            <Input
              name="to"
              type="number"
              min={1}
              defaultValue={chapterTo ?? ""}
              placeholder="마지막 화"
              className="border-sw-border-default bg-sw-bg-elevated text-sw-text-primary placeholder:text-sw-text-muted focus-visible:border-sw-border-focus focus-visible:ring-sw-border-focus/40"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-medium text-sw-text-secondary">
              운영 메모
            </span>
            <select
              name="operatorNotes"
              defaultValue={includeOperatorNotes ? "true" : "false"}
              className="h-9 w-full rounded-md border border-sw-border-default bg-sw-bg-elevated px-3 py-1 text-sm text-sw-text-primary shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-sw-border-focus focus-visible:ring-[3px] focus-visible:ring-sw-border-focus/40"
            >
              <option value="true">포함</option>
              <option value="false">제외</option>
            </select>
          </label>

          <div className="flex items-end gap-2">
            <Button
              type="submit"
              size="sm"
              className="bg-sw-cta text-sw-bg-base hover:bg-sw-cta/90"
            >
              <RotateCw />
              다시 생성
            </Button>
          </div>
        </form>

        <div className="rounded-lg border border-sw-border-default bg-sw-bg-surface">
          <div className="flex items-center justify-between border-b border-sw-border-default px-4 py-3">
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-sw-text-secondary" />
              <div>
                <h2 className="text-sm font-semibold text-sw-text-primary">Markdown 초안</h2>
                <p className="text-xs text-sw-text-secondary">
                  PDF/export/히스토리 저장 없이 현재 요청에서만 생성됩니다.
                </p>
              </div>
            </div>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="text-sw-text-secondary hover:bg-sw-bg-hover hover:text-sw-text-primary"
            >
              <Link href={`/projects/${projectId}/write`}>집필 화면</Link>
            </Button>
          </div>

          {error ? (
            <div className="p-6 text-sm text-sw-danger">{error}</div>
          ) : markdown ? (
            <pre className="sw-scrollbar max-h-[calc(100vh-270px)] overflow-auto whitespace-pre-wrap p-4 text-xs leading-6 text-sw-text-primary">
              {markdown}
            </pre>
          ) : (
            <div className="p-6 text-sm text-sw-text-secondary">
              생성된 리포트 초안이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
