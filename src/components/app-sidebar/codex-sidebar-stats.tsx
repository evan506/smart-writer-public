"use client";

import { useEffect, useState } from "react";
import { getCodexSidebarStats } from "@/app/(dashboard)/projects/[id]/codex-actions";
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar";

interface CodexSidebarStatsData {
  projectTitle: string;
  projectGenre: string | null;
  entityCount: number;
  confirmedCount: number;
  reviewCount: number;
  relationCount: number;
}

export function CodexSidebarStats({ projectId }: { projectId: string }) {
  const [stats, setStats] = useState<CodexSidebarStatsData | null>(null);

  useEffect(() => {
    getCodexSidebarStats(projectId).then(setStats);
  }, [projectId]);

  if (!stats) return null;

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        {stats.projectTitle && (
          <div className="px-3 pb-2 flex items-center gap-2 min-w-0">
            <span className="text-[11px] text-sw-text-muted truncate">
              {stats.projectTitle}
            </span>
            {stats.projectGenre && (
              <span
                className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-extrabold"
                style={{
                  color: "var(--sw-accent)",
                  background: "var(--sw-bg-active)",
                  border: "1px solid var(--sw-border-focus)",
                }}
              >
                {stats.projectGenre}
              </span>
            )}
          </div>
        )}
        <div className="px-3 py-1">
          <div className="text-[10px] font-medium text-sw-text-dim uppercase tracking-wider mb-1">
            통계
          </div>
          <div className="text-[11px] text-sw-text-muted mb-[2px]">작품 기억 항목</div>
          <div className="text-xl font-bold font-mono text-sw-text-primary mb-[2px]">
            {stats.entityCount}
          </div>
          <div className="text-[10.5px] mb-3">
            <span className="text-sw-text-muted">저장됨 </span>
            <span className="text-sw-accent font-medium">
              {stats.confirmedCount}
            </span>
            <span className="text-sw-text-muted"> · 검토 필요 </span>
            <span className="text-sw-warning font-medium">
              {stats.reviewCount}
            </span>
          </div>
          <div className="text-[11px] text-sw-text-muted mb-[2px]">고유 관계</div>
          <div className="text-xl font-bold font-mono text-sw-text-primary">
            {stats.relationCount}
          </div>
        </div>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
