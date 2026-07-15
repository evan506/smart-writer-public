import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ForeshadowStatusTabs } from "@/components/foreshadow-status-tabs";
import { ForeshadowCard } from "@/components/foreshadow-card";
import { CreateForeshadowDialog } from "@/components/create-foreshadow-dialog";
import { EmptyState } from "@/components/empty-state";
import { buildForeshadowListMetrics } from "@/lib/services/foreshadow-utils";
import { GitFork } from "lucide-react";
import type { Entity, Foreshadow, ForeshadowStatus } from "@/types";

export const dynamic = "force-dynamic";

export default async function ForeshadowsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { id } = await params;
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("foreshadows")
    .select("*")
    .eq("project_id", id)
    .order("planted_chapter");

  if (status) {
    query = query.eq("status", status);
  }

  const [foreshadowsRes, entitiesRes] = await Promise.all([
    query,
    supabase.from("entities").select("id, name").eq("project_id", id).order("name"),
  ]);

  const foreshadows = (foreshadowsRes.data ?? []) as Foreshadow[];
  const entities = (entitiesRes.data ?? []) as Entity[];
  const allForeshadows =
    status || foreshadowsRes.error
      ? ((await supabase
          .from("foreshadows")
          .select("status, expected_reveal")
          .eq("project_id", id)).data ?? [])
      : foreshadows;
  const { counts, unscheduledCount } = buildForeshadowListMetrics(
    allForeshadows as { status: ForeshadowStatus | null; expected_reveal: number | null }[]
  );
  const entityNames: Record<string, string> = {};
  entities.forEach((e) => {
    entityNames[e.id] = e.name;
  });

  return (
    <div style={{ background: "var(--sw-bg-base)" }} className="min-h-screen">
      <PageHeader title="복선" description="복선의 심기, 회수, 폐기를 관리하세요">
        <CreateForeshadowDialog projectId={id} entities={entities} />
      </PageHeader>

      <div className="p-6 space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-sw-border-default bg-sw-bg-surface p-4">
            <p className="text-xs text-sw-text-secondary">전체 복선</p>
            <p className="mt-1 text-2xl font-semibold text-sw-text-primary">{counts.ALL}</p>
          </div>
          <div className="rounded-2xl border border-sw-border-default bg-sw-bg-surface p-4">
            <p className="text-xs text-sw-text-secondary">심어짐</p>
            <p className="mt-1 text-2xl font-semibold text-sw-accent">{counts.PLANTED}</p>
          </div>
          <div className="rounded-2xl border border-sw-border-default bg-sw-bg-surface p-4">
            <p className="text-xs text-sw-text-secondary">회수됨</p>
            <p className="mt-1 text-2xl font-semibold text-sw-info">{counts.REVEALED}</p>
          </div>
          <div className="rounded-2xl border border-sw-border-default bg-sw-bg-surface p-4">
            <p className="text-xs text-sw-text-secondary">회수 미정</p>
            <p className="mt-1 text-2xl font-semibold text-sw-text-primary">{unscheduledCount}</p>
          </div>
        </div>

        <ForeshadowStatusTabs
          projectId={id}
          currentStatus={status}
          counts={counts}
        />

        {foreshadows.length === 0 ? (
          <EmptyState
            icon={GitFork}
            title={status ? "해당 상태의 복선이 없습니다" : "복선이 없습니다"}
            description={
              status
                ? "다른 상태를 선택하거나 새 복선을 추가하세요"
                : "앞으로 회수할 단서, 약속, 의문을 작품 기억에 연결해 두세요"
            }
          >
            <CreateForeshadowDialog projectId={id} entities={entities} />
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {foreshadows.map((f) => (
              <ForeshadowCard
                key={f.id}
                foreshadow={f}
                projectId={id}
                entityNames={entityNames}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
