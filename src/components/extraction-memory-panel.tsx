"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkles, RotateCcw, Power, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  activateExtractionRule,
  deleteExtractionRule,
  disableExtractionRule,
  generateExtractionProposals,
  overrideGenreConventionRule,
  removeProjectExcludedTerm,
  restoreGenreConventionRule,
} from "@/app/(dashboard)/projects/[id]/extraction-memory-actions";

export interface MemoryPanelRuleView {
  id: string | null;
  key: string;
  text: string;
  kind: "EXCLUDE_PATTERN" | "TYPE_CONVENTION";
  layer: "project" | "genre";
  source: "DISTILLED" | "MANUAL" | "CURATED";
  status: "ACTIVE" | "DISABLED";
}

export interface ExtractionMemoryView {
  projectRules: MemoryPanelRuleView[];
  genreRules: MemoryPanelRuleView[];
  proposals: MemoryPanelRuleView[];
  excludedNames: string[];
}

export interface ExtractionMetricsView {
  confirmed: number;
  dismissed: number;
  acceptanceRate: number | null;
}

function LayerBadge({ layer }: { layer: "project" | "genre" }) {
  return layer === "project" ? (
    <Badge
      variant="outline"
      className="border-sw-accent-border bg-sw-accent-bg text-sw-accent"
    >
      이 작품
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="border-sw-info/25 bg-sw-info/10 text-sw-info"
    >
      장르 기본
    </Badge>
  );
}

function KindLabel({ kind }: { kind: MemoryPanelRuleView["kind"] }) {
  return (
    <span className="text-xs font-semibold text-sw-text-muted">
      {kind === "EXCLUDE_PATTERN" ? "제외" : "분류"}
    </span>
  );
}

export function ExtractionMemoryPanel({
  projectId,
  initial,
  metrics,
}: {
  projectId: string;
  initial: ExtractionMemoryView;
  metrics: ExtractionMetricsView;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [proposing, setProposing] = useState(false);

  function run(action: () => Promise<{ error: string | null }>, ok?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
      } else {
        if (ok) toast.success(ok);
        router.refresh();
      }
    });
  }

  function handleGenerateProposals() {
    setProposing(true);
    startTransition(async () => {
      const result = await generateExtractionProposals(projectId);
      setProposing(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.proposed > 0) {
        toast.success(`거절 기록에서 ${result.proposed}개 규칙을 제안했습니다`);
      } else if (result.skippedReason === "too_few_dismissals") {
        toast.info("규칙을 제안하려면 거절 기록이 더 필요합니다");
      } else {
        toast.info("새로 제안할 만한 공통 패턴을 찾지 못했습니다");
      }
      router.refresh();
    });
  }

  const hasAnything =
    initial.projectRules.length > 0 ||
    initial.genreRules.length > 0 ||
    initial.proposals.length > 0 ||
    initial.excludedNames.length > 0;

  return (
    <Card className="border-sw-border-default bg-sw-bg-surface text-sw-text-primary">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base text-sw-text-primary">
              작품 학습 메모리
            </CardTitle>
            <CardDescription className="text-sw-text-secondary">
              추출 도구가 이 작품에 맞게 학습한 규칙입니다. 작품 기억(캐넌)은
              바뀌지 않으며, 모든 항목은 직접 끄거나 되돌릴 수 있습니다.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="border-sw-border-default bg-sw-bg-elevated text-sw-text-primary hover:bg-sw-bg-hover hover:text-sw-text-primary"
            onClick={handleGenerateProposals}
            disabled={isPending}
          >
            <Sparkles className="mr-1 size-3.5" />
            {proposing ? "분석 중…" : "거절 기록에서 규칙 제안"}
          </Button>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-xs text-sw-text-muted">
          <span>
            적용 우선순위 <b>이 작품</b> &gt; <b>내 계정</b> &gt;{" "}
            <b>장르 기본</b>
          </span>
          {metrics.acceptanceRate !== null && (
            <span aria-label="후보 승인율">
              · 후보 승인율 {metrics.acceptanceRate}% (승인 {metrics.confirmed} ·
              거절 {metrics.dismissed})
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {initial.proposals.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-sw-warning">
              제안된 규칙 — 켜기 전에는 추출에 적용되지 않습니다
            </h4>
            {initial.proposals.map((rule) => (
              <div
                key={rule.id ?? rule.key}
                className="flex items-start gap-2 rounded-md border border-sw-warning/25 bg-sw-warn-soft p-2.5"
              >
                <KindLabel kind={rule.kind} />
                <p className="flex-1 text-sm text-sw-text-primary">{rule.text}</p>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-sw-border-default bg-sw-bg-elevated text-sw-text-primary hover:bg-sw-bg-hover hover:text-sw-text-primary"
                    disabled={isPending || !rule.id}
                    onClick={() =>
                      rule.id &&
                      run(
                        () => activateExtractionRule(projectId, rule.id!),
                        "규칙을 적용했습니다"
                      )
                    }
                  >
                    <Power className="mr-1 size-3.5" />적용
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-sw-text-muted hover:bg-sw-bg-hover hover:text-sw-text-primary"
                    disabled={isPending || !rule.id}
                    onClick={() =>
                      rule.id &&
                      run(() => deleteExtractionRule(projectId, rule.id!))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}

        {initial.projectRules.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-sw-text-muted">
              이 작품에서 학습한 규칙
            </h4>
            {initial.projectRules.map((rule) => (
              <div
                key={rule.id ?? rule.key}
                className="flex items-start gap-2 rounded-md border border-sw-border-default bg-sw-bg-elevated p-2.5"
              >
                <KindLabel kind={rule.kind} />
                <div className="flex-1">
                  <p className="text-sm text-sw-text-primary">{rule.text}</p>
                  <div className="mt-1 flex gap-1.5">
                    <LayerBadge layer="project" />
                    {rule.status === "DISABLED" && (
                      <Badge
                        variant="secondary"
                        className="bg-sw-bg-raised text-xs text-sw-text-muted"
                      >
                        꺼짐
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-sw-text-muted hover:bg-sw-bg-hover hover:text-sw-text-primary"
                    disabled={isPending || !rule.id}
                    onClick={() =>
                      rule.id &&
                      run(() =>
                        rule.status === "ACTIVE"
                          ? disableExtractionRule(projectId, rule.id!)
                          : activateExtractionRule(projectId, rule.id!)
                      )
                    }
                  >
                    <Power className="mr-1 size-3.5" />
                    {rule.status === "ACTIVE" ? "사용 안 함" : "사용"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-sw-text-muted hover:bg-sw-bg-hover hover:text-sw-text-primary"
                    disabled={isPending || !rule.id}
                    onClick={() =>
                      rule.id &&
                      run(() => deleteExtractionRule(projectId, rule.id!))
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </section>
        )}

        {initial.genreRules.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-sw-text-muted">
              장르 기본 규칙
            </h4>
            {initial.genreRules.map((rule) => (
              <div
                key={rule.key}
                className="flex items-start gap-2 rounded-md border border-sw-border-default bg-sw-bg-elevated p-2.5"
              >
                <KindLabel kind={rule.kind} />
                <div className="flex-1">
                  <p className="text-sm text-sw-text-primary">{rule.text}</p>
                  <div className="mt-1 flex gap-1.5">
                    <LayerBadge layer="genre" />
                    {rule.status === "DISABLED" && (
                      <Badge
                        variant="secondary"
                        className="bg-sw-bg-raised text-xs text-sw-text-muted"
                      >
                        이 작품에서 꺼짐
                      </Badge>
                    )}
                  </div>
                </div>
                {rule.status === "ACTIVE" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-sw-text-muted hover:bg-sw-bg-hover hover:text-sw-text-primary"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        overrideGenreConventionRule(
                          projectId,
                          rule.key,
                          rule.text
                        )
                      )
                    }
                  >
                    <Power className="mr-1 size-3.5" />이 작품에서 끄기
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-sw-text-muted hover:bg-sw-bg-hover hover:text-sw-text-primary"
                    disabled={isPending}
                    onClick={() =>
                      run(() =>
                        restoreGenreConventionRule(projectId, rule.key)
                      )
                    }
                  >
                    <RotateCcw className="mr-1 size-3.5" />다시 켜기
                  </Button>
                )}
              </div>
            ))}
          </section>
        )}

        {initial.excludedNames.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-sw-text-muted">
              제외된 이름 — 잘못 거절했다면 제외를 해제하세요
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {initial.excludedNames.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1 rounded-full border border-sw-border-default px-2.5 py-1 text-xs text-sw-text-primary"
                >
                  {name}
                  <button
                    type="button"
                    aria-label={`${name} 제외 해제`}
                    className="text-sw-text-muted hover:text-sw-text-primary"
                    disabled={isPending}
                    onClick={() =>
                      run(
                        () => removeProjectExcludedTerm(projectId, name),
                        `'${name}' 제외를 해제했습니다`
                      )
                    }
                  >
                    <Undo2 className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </section>
        )}

        {!hasAnything && (
          <p className="text-sm text-sw-text-muted">
            아직 학습된 규칙이 없습니다. 후보를 검토하고 거절하면 이 작품에 맞는
            규칙이 쌓입니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
