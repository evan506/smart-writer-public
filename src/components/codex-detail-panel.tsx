"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitMerge, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteEntity,
  mergeEntityAsAlias,
  removeEntityAlias,
} from "@/app/(dashboard)/projects/[id]/codex-actions";
import { AliasesSection } from "@/components/codex-detail-panel/aliases-section";
import { getColor, TYPE_LABELS } from "@/components/codex-detail-panel/constants";
import { DetailSection } from "@/components/codex-detail-panel/detail-section";
import { EvidenceSection } from "@/components/codex-detail-panel/evidence-section";
import { FactsSection } from "@/components/codex-detail-panel/facts-section";
import { ForeshadowSection } from "@/components/codex-detail-panel/foreshadow-section";
import { MetaGrid } from "@/components/codex-detail-panel/meta-grid";
import { MiniGraph } from "@/components/codex-detail-panel/mini-graph";
import { RelationList } from "@/components/codex-detail-panel/relation-list";
import type { CodexDetailPanelProps, RelationItem } from "@/components/codex-detail-panel/types";
import { EditEntityDialog } from "@/components/edit-entity-dialog";
import type { Entity } from "@/types";

export function CodexDetailPanel({
  entity,
  kind,
  entityLinks,
  relationEvidence,
  allEntities,
  chapters,
  evidence,
  foreshadows,
  facts,
  status,
  firstChapter,
  projectId,
  onClose,
  onEntityClick,
  onDeleted,
}: CodexDetailPanelProps) {
  const router = useRouter();
  // A candidate's `entity.id` is an entity_suggestions row, so every management action
  // here — all of which resolve the id against `entities` — would fail on it. Candidates
  // are approved in the write workspace's 확인 panel; the codex is where approved memory
  // is read (docs/demo-guide.md §4-6). Show the record, withhold the actions.
  const isCandidate = kind === "suggestion";
  const [isPending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeSearch, setMergeSearch] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [localAliases, setLocalAliases] = useState<string[] | null>(null);

  useEffect(() => {
    setLocalAliases(null);
  }, [entity.id]);

  const aliases = localAliases ?? (
    Array.isArray(entity.aliases)
      ? (entity.aliases as string[])
      : []
  );

  const color = getColor(entity.type);
  const sortedEvidence = useMemo(() => {
    return [...evidence].sort((a, b) => {
      if (a.chapterNum !== b.chapterNum) return a.chapterNum - b.chapterNum;
      return (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "");
    });
  }, [evidence]);
  const sortedForeshadows = useMemo(() => {
    return [...foreshadows].sort((a, b) => a.plantedChapter - b.plantedChapter);
  }, [foreshadows]);
  const uniqueRelations = useMemo(() => {
    const relationItems: RelationItem[] = entityLinks.map((link) => {
      const otherId = link.from_id === entity.id ? link.to_id : link.from_id;
      const otherName = link.from_id === entity.id ? link.to_name : link.from_name;
      const otherEntity = allEntities.find((e) => e.id === otherId);
      const evidence = [...(relationEvidence[link.id] ?? [])].sort((a, b) => {
        if (a.chapterNum !== b.chapterNum) return a.chapterNum - b.chapterNum;
        return (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "");
      });

      return {
        linkId: link.id,
        id: otherId,
        name: otherName,
        type: otherEntity?.type ?? "CONCEPT",
        relationType: link.relation_type,
        weight: link.weight,
        evidence,
      };
    });

    return Array.from(new Map(relationItems.map((r) => [r.id, r])).values());
  }, [allEntities, entity.id, entityLinks, relationEvidence]);

  const mergeTargets = useMemo(() => {
    const query = mergeSearch.trim().toLocaleLowerCase("ko");
    return allEntities
      .filter((candidate) => candidate.id !== entity.id)
      .filter((candidate) => {
        if (!query) return true;
        const candidateAliases = Array.isArray(candidate.aliases)
          ? (candidate.aliases as string[])
          : [];
        return (
          candidate.name.toLocaleLowerCase("ko").includes(query) ||
          candidateAliases.some((alias) => alias.toLocaleLowerCase("ko").includes(query))
        );
      })
      .slice(0, 8);
  }, [allEntities, entity.id, mergeSearch]);

  const handleDelete = () => {
    if (!confirm(`"${entity.name}" 작품 기억 항목을 삭제하시겠습니까?`)) return;
    startTransition(async () => {
      const result = await deleteEntity(entity.id, projectId);
      if (result.error) {
        alert(result.error);
      } else {
        onDeleted();
      }
    });
  };

  const handleRemoveAlias = (alias: string) => {
    if (!confirm(`"${alias}" 별칭을 ${entity.name}에서 제거할까요?`)) return;
    startTransition(async () => {
      const result = await removeEntityAlias(entity.id, projectId, alias);
      if (result.error) {
        alert(result.error);
      } else {
        setLocalAliases(result.aliases ?? []);
      }
    });
  };

  const handleMergeAsAlias = () => {
    const target = allEntities.find((candidate) => candidate.id === mergeTargetId);
    if (!target) {
      toast.error("합칠 대상 항목을 선택해 주세요");
      return;
    }

    const confirmed = confirm(
      `"${entity.name}"을(를) "${target.name}"의 별칭/호칭으로 합칠까요? 원문 근거, 관계, 승인된 세부 설정은 대상 항목으로 이전됩니다.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await mergeEntityAsAlias(entity.id, target.id, projectId);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`${result.sourceName ?? entity.name}을 ${result.targetName ?? target.name}의 별칭으로 합쳤습니다`);
      setMergeOpen(false);
      setMergeTargetId("");
      setMergeSearch("");
      router.refresh();
      onDeleted();
    });
  };

  const statusLabel =
    status === "confirmed" ? "저장됨" : status === "review" ? "확인 필요" : "이름 확인";
  const statusColor =
    status === "confirmed"
      ? "var(--sw-accent)"
      : status === "review"
        ? "var(--sw-warning)"
        : "var(--sw-danger)";

  return (
    <div
      className="flex flex-col flex-shrink-0 h-full overflow-y-auto sw-scrollbar"
      style={{
        width: 360,
        background: "var(--sw-bg-surface)",
        borderLeft: "1px solid var(--sw-border-default)",
      }}
    >
      <div
        className="sticky top-0 z-[2] px-5 pt-[18px] pb-[14px]"
        style={{
          borderBottom: "1px solid var(--sw-border-default)",
          background: "var(--sw-bg-surface)",
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold tracking-tight" style={{ color: "var(--sw-text-primary)" }}>
                {entity.name}
              </span>
              {!isCandidate && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="w-[26px] h-[26px] rounded-md flex items-center justify-center cursor-pointer transition-colors"
                  style={{
                    background: "var(--sw-bg-active)",
                    border: "1px solid var(--sw-border-focus)",
                    color: "var(--sw-accent)",
                  }}
                  title="편집"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-[7px] mt-1">
              <span
                className="text-[10px] font-semibold uppercase px-[6px] py-[1px] rounded-[3px]"
                style={{ background: `${color}28`, color }}
              >
                {TYPE_LABELS[entity.type] ?? entity.type}
              </span>
              <span
                className="text-[10.5px] font-medium"
                style={{ color: statusColor }}
              >
                {statusLabel}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-[26px] h-[26px] rounded-md flex items-center justify-center cursor-pointer transition-colors"
            style={{
              background: "transparent",
              border: "1px solid var(--sw-border-muted)",
              color: "var(--sw-text-dim)",
            }}
          >
            <X size={13} />
          </button>
        </div>
      </div>

      <DetailSection title="작품 기억 요약">
        <p
          className="text-[13px] leading-[1.6]"
          style={{ color: "var(--sw-text-muted)" }}
        >
          {entity.summary ?? "기록 없음"}
        </p>
      </DetailSection>

      <AliasesSection
        aliases={aliases}
        isPending={isPending}
        onRemoveAlias={isCandidate ? undefined : handleRemoveAlias}
      />

      <MetaGrid
        firstChapter={firstChapter}
        relationCount={uniqueRelations.length}
        statusLabel={statusLabel}
        statusColor={statusColor}
        chapterCount={chapters.length}
      />

      <EvidenceSection evidence={sortedEvidence} color={color} />

      <FactsSection facts={facts} />

      <DetailSection title="관계 맵" titleSuffix="(직접 연결, 최대 6)">
        <MiniGraph
          centerEntity={entity}
          links={entityLinks}
          allEntities={allEntities}
        />
      </DetailSection>

      <RelationList
        relations={uniqueRelations}
        color={color}
        onEntityClick={onEntityClick}
      />

      <ForeshadowSection foreshadows={sortedForeshadows} color={color} />

      <div
        className="mt-auto px-5 py-[14px] space-y-2"
        style={{
          borderTop: "1px solid var(--sw-border-default)",
          background: "var(--sw-bg-base)",
        }}
      >
        {isCandidate ? (
          <div>
            <p className="text-[11px] font-bold" style={{ color: "var(--sw-text-muted)" }}>
              아직 후보입니다
            </p>
            <p className="text-[10.5px] leading-[1.45] mt-1" style={{ color: "var(--sw-text-ghost)" }}>
              이 항목은 원고에서 찾은 후보라 아직 작품 기억에 저장되지 않았습니다. 집필 화면의{" "}
              <span style={{ color: "var(--sw-text-muted)" }}>확인</span> 패널에서 원문 근거를 보고
              승인하거나 넘길 수 있습니다.
            </p>
            <Link
              href={`/projects/${projectId}/write`}
              className="mt-2 w-full py-2 rounded-md text-[12px] font-medium cursor-pointer text-center transition-colors inline-flex items-center justify-center gap-2"
              style={{
                background: "rgba(79, 140, 92, 0.08)",
                border: "1px solid rgba(79, 140, 92, 0.2)",
                color: "var(--sw-accent)",
              }}
            >
              확인 패널에서 검토하기
            </Link>
          </div>
        ) : (
          <>
        <div>
          <p className="text-[11px] font-bold" style={{ color: "var(--sw-text-muted)" }}>
            관리 작업
          </p>
          <p className="text-[10.5px] leading-[1.45] mt-1" style={{ color: "var(--sw-text-ghost)" }}>
            읽기 내용과 별도로 항목 병합이나 삭제가 필요할 때만 사용하세요.
          </p>
        </div>
        {!mergeOpen ? (
          <button
            onClick={() => setMergeOpen(true)}
            disabled={isPending}
            className="w-full py-2 rounded-md text-[12px] font-medium cursor-pointer text-center transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            style={{
              background: "rgba(79, 140, 92, 0.08)",
              border: "1px solid rgba(79, 140, 92, 0.2)",
              color: "var(--sw-accent)",
              fontFamily: "inherit",
            }}
          >
            <GitMerge size={13} />
            다른 항목의 별칭으로 합치기
          </button>
        ) : (
          <div
            className="rounded-md p-3 space-y-2"
            style={{
              border: "1px solid var(--sw-border-default)",
              background: "var(--sw-bg-elevated)",
            }}
          >
            <div>
              <p className="text-[12px] font-semibold" style={{ color: "var(--sw-text-primary)" }}>
                다른 항목의 별칭으로 합치기
              </p>
              <p className="text-[10.5px] leading-[1.5] mt-1" style={{ color: "var(--sw-text-muted)" }}>
                현재 항목 이름과 근거를 대상 항목으로 옮기고, 현재 항목은 삭제됩니다.
              </p>
            </div>
            <input
              value={mergeSearch}
              onChange={(event) => setMergeSearch(event.target.value)}
              placeholder="대상 항목 검색"
              className="w-full h-8 rounded-md px-2 text-[12px] outline-none"
              style={{
                border: "1px solid var(--sw-border-default)",
                background: "var(--sw-bg-surface)",
                color: "var(--sw-text-primary)",
              }}
            />
            <div className="max-h-[168px] overflow-y-auto sw-scrollbar space-y-1">
              {mergeTargets.length > 0 ? (
                mergeTargets.map((target) => (
                  <button
                    key={target.id}
                    type="button"
                    onClick={() => setMergeTargetId(target.id)}
                    className="w-full rounded-md px-2 py-2 text-left transition-colors"
                    style={{
                      border: mergeTargetId === target.id
                        ? "1px solid rgba(79, 140, 92, 0.36)"
                        : "1px solid var(--sw-border-subtle)",
                      background: mergeTargetId === target.id
                        ? "rgba(79, 140, 92, 0.1)"
                        : "transparent",
                      color: "var(--sw-text-secondary)",
                    }}
                  >
                    <span className="block text-[12px] font-semibold">{target.name}</span>
                    <span className="block text-[10px] mt-0.5" style={{ color: "var(--sw-text-ghost)" }}>
                      {TYPE_LABELS[target.type] ?? target.type}
                    </span>
                  </button>
                ))
              ) : (
                <p className="py-4 text-center text-[11px]" style={{ color: "var(--sw-text-ghost)" }}>
                  합칠 대상 항목이 없습니다
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMergeOpen(false);
                  setMergeTargetId("");
                  setMergeSearch("");
                }}
                disabled={isPending}
                className="rounded-md py-2 text-[12px] font-medium disabled:opacity-50"
                style={{
                  border: "1px solid var(--sw-border-default)",
                  color: "var(--sw-text-muted)",
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleMergeAsAlias}
                disabled={isPending || !mergeTargetId}
                className="rounded-md py-2 text-[12px] font-medium disabled:opacity-50"
                style={{
                  background: "var(--sw-accent)",
                  color: "var(--sw-bg-base)",
                }}
              >
                {isPending ? "합치는 중..." : "별칭으로 합치기"}
              </button>
            </div>
          </div>
        )}
        <button
          onClick={handleDelete}
          disabled={isPending}
          className="w-full py-2 rounded-md text-[12px] font-medium cursor-pointer text-center transition-colors hover:text-red-400 hover:border-red-400/25 hover:bg-red-500/[0.08] disabled:opacity-50"
          style={{
            background: "rgba(163, 90, 69, 0.05)",
            border: "1px solid rgba(163, 90, 69, 0.22)",
            color: "var(--sw-danger)",
            fontFamily: "inherit",
          }}
        >
          {isPending ? "삭제 중..." : "작품 기억에서 삭제"}
        </button>
          </>
        )}
      </div>

      {!isCandidate && (
        <EditEntityDialog
          entity={entity as unknown as Entity}
          projectId={projectId}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </div>
  );
}
