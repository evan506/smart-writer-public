import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ForeshadowStatusBadge } from "@/components/foreshadow-status-badge";
import { EditForeshadowDialog } from "@/components/edit-foreshadow-dialog";
import { DeleteForeshadowButton } from "./delete-foreshadow-button";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, BookOpen, Link2 } from "lucide-react";
import type { Entity, Foreshadow, ForeshadowStatus } from "@/types";

const ENTITY_TYPE_LABELS: Record<string, string> = {
  CHARACTER: "인물",
  PLACE: "장소",
  ITEM: "아이템",
  ORGANIZATION: "조직",
  CONCEPT: "개념",
  MAGIC_SYSTEM: "마법체계",
};

export default async function ForeshadowDetailPage({
  params,
}: {
  params: Promise<{ id: string; foreshadowId: string }>;
}) {
  const { id: projectId, foreshadowId } = await params;
  const supabase = await createClient();

  const [foreshadowRes, entitiesRes] = await Promise.all([
    supabase.from("foreshadows").select("*").eq("id", foreshadowId).single(),
    supabase
      .from("entities")
      .select("id, name, type")
      .eq("project_id", projectId)
      .order("name"),
  ]);

  if (!foreshadowRes.data) {
    notFound();
  }

  const foreshadow = foreshadowRes.data as Foreshadow;
  const allEntities = (entitiesRes.data ?? []) as Entity[];
  const linkedEntityIds = (foreshadow.entity_ids ?? []) as string[];
  const linkedEntities = allEntities.filter((e) =>
    linkedEntityIds.includes(e.id)
  );
  const expectedRevealLabel = foreshadow.expected_reveal
    ? `${foreshadow.expected_reveal}화`
    : "미정";

  return (
    <div style={{ background: "var(--sw-bg-base)" }} className="min-h-screen">
      <PageHeader
        title="복선 상세"
        description="심은 회차, 회수 예정, 연결된 작품 기억 항목을 확인합니다"
      >
        <EditForeshadowDialog
          foreshadow={foreshadow}
          projectId={projectId}
          entities={allEntities}
        />
        <DeleteForeshadowButton
          foreshadowId={foreshadowId}
          projectId={projectId}
        />
      </PageHeader>

      <div className="p-6 space-y-6">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-sw-text-secondary hover:bg-sw-bg-hover hover:text-sw-text-primary"
        >
          <Link href={`/projects/${projectId}/foreshadows`}>
            <ArrowLeft className="mr-2 size-4" />
            복선 목록으로 돌아가기
          </Link>
        </Button>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-sw-border-default bg-sw-bg-surface p-4">
            <p className="text-xs text-sw-text-secondary">상태</p>
            <div className="mt-2">
              <ForeshadowStatusBadge
                status={foreshadow.status as ForeshadowStatus}
              />
            </div>
          </div>
          <div className="rounded-2xl border border-sw-border-default bg-sw-bg-surface p-4">
            <p className="text-xs text-sw-text-secondary">회차 흐름</p>
            <div className="mt-2 flex items-center gap-2 text-lg font-semibold text-sw-text-primary">
              <span>{foreshadow.planted_chapter}화</span>
              <ArrowRight className="size-4 text-sw-text-muted" />
              <span>{expectedRevealLabel}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-sw-border-default bg-sw-bg-surface p-4">
            <p className="text-xs text-sw-text-secondary">연결 항목</p>
            <p className="mt-1 text-2xl font-semibold text-sw-text-primary">
              {linkedEntities.length}
            </p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
          <div className="rounded-2xl border border-sw-border-default bg-sw-bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-sw-text-primary">
              <BookOpen className="size-4 text-sw-text-muted" />
              복선 내용
            </div>
            {foreshadow.description ? (
              <p className="whitespace-pre-wrap text-sm leading-6 text-sw-text-secondary">
                {foreshadow.description}
              </p>
            ) : (
              <div className="rounded-md border border-dashed border-sw-border-default p-4 text-sm text-sw-text-muted">
                아직 설명이 없습니다. 복선이 드러나는 장면이나 회수할 약속을
                적어두세요.
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-sw-border-default bg-sw-bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-sw-text-primary">
              <Link2 className="size-4 text-sw-text-muted" />
              연결된 작품 기억 항목
            </div>
            {linkedEntities.length === 0 ? (
              <div className="rounded-md border border-dashed border-sw-border-default p-4 text-sm text-sw-text-muted">
                연결된 작품 기억 항목이 없습니다. 수정에서 인물, 장소, 설정을
                연결하면 Codex 상세에도 함께 표시됩니다.
              </div>
            ) : (
              <div className="space-y-2">
                {linkedEntities.map((entity) => (
                  <Link
                    key={entity.id}
                    href={`/projects/${projectId}/codex?entity=${entity.id}`}
                    className="flex items-center gap-2 rounded-md border border-sw-border-default px-3 py-2 transition-colors hover:bg-sw-bg-hover"
                  >
                    <span className="font-medium text-sw-text-primary">
                      {entity.name}
                    </span>
                    <span className="rounded-full border border-sw-border-default px-1.5 py-0.5 text-xs text-sw-text-muted">
                      {ENTITY_TYPE_LABELS[entity.type] ?? entity.type}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
