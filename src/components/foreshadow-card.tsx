import Link from "next/link";
import { ArrowRight, GitCommit, Link2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ForeshadowStatusBadge } from "@/components/foreshadow-status-badge";
import type { Foreshadow, ForeshadowStatus } from "@/types";

export function ForeshadowCard({
  foreshadow,
  projectId,
  entityNames,
}: {
  foreshadow: Foreshadow;
  projectId: string;
  entityNames?: Record<string, string>;
}) {
  const entityIds = (foreshadow.entity_ids ?? []) as string[];
  const revealLabel = foreshadow.expected_reveal
    ? `${foreshadow.expected_reveal}화`
    : "미정";

  return (
    <Link
      href={`/projects/${projectId}/foreshadows/${foreshadow.id}`}
      className="block h-full"
    >
      <Card className="h-full rounded-2xl border-sw-border-default bg-sw-bg-surface text-sw-text-primary transition-colors hover:border-sw-border-hover hover:bg-sw-bg-elevated">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium text-sw-text-primary">
              <GitCommit className="size-4 text-sw-text-muted" />
              <span>{foreshadow.planted_chapter}화</span>
              <ArrowRight className="size-3 text-sw-text-muted" />
              <span>{revealLabel}</span>
            </CardTitle>
            <ForeshadowStatusBadge
              status={foreshadow.status as ForeshadowStatus}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="min-h-10 text-sm leading-5 line-clamp-2 text-sw-text-secondary">
            {foreshadow.description || "설명 없음"}
          </p>
          {entityIds.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {entityIds.slice(0, 4).map((eid) => (
                <Badge
                  key={eid}
                  variant="secondary"
                  className="bg-sw-bg-hover text-sw-text-secondary border-sw-border-default text-xs"
                >
                  {entityNames?.[eid] ?? eid.slice(0, 8)}
                </Badge>
              ))}
              {entityIds.length > 4 && (
                <Badge
                  variant="outline"
                  className="border-sw-border-default text-sw-text-muted text-xs"
                >
                  +{entityIds.length - 4}
                </Badge>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-sw-text-muted">
              <Link2 className="size-3" />
              연결 항목 없음
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
