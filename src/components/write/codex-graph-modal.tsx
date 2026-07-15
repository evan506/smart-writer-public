"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { X, Loader2, LocateFixed, RefreshCw, Network } from "lucide-react";
import { getCodexData } from "@/app/(dashboard)/projects/[id]/codex-actions";
import {
  ENTITY_TYPE_CONFIG,
  RELATION_COLORS,
  RELATION_TYPE_LABELS,
} from "@/lib/design-tokens";
import type { GraphNode, GraphLink, GraphViewCommand } from "./codex-force-graph";

const CodexForceGraph = dynamic(() => import("./codex-force-graph").then(m => m.CodexForceGraph), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full"><Loader2 className="size-6 animate-spin" /></div>,
});

interface Props {
  projectId: string;
  onClose: () => void;
  selectedEntityId?: string | null;
  onSelectEntity?: (entityId: string) => void;
}

export function CodexGraphModal({
  projectId,
  onClose,
  selectedEntityId,
  onSelectEntity,
}: Props) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState<string[]>([]);
  const [relationTypeFilter, setRelationTypeFilter] = useState<string[]>([]);
  const [viewCommand, setViewCommand] = useState<{
    type: GraphViewCommand;
    nonce: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await getCodexData(projectId);
    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Build link count map for importance
    const linkCountMap = new Map<string, number>();
    result.links.forEach((l) => {
      linkCountMap.set(l.from_id, (linkCountMap.get(l.from_id) ?? 0) + 1);
      linkCountMap.set(l.to_id, (linkCountMap.get(l.to_id) ?? 0) + 1);
    });

    const graphNodes: GraphNode[] = result.entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      summary: e.summary,
      importance: linkCountMap.get(e.id) ?? 0,
    }));

    const graphLinks: GraphLink[] = result.links.map((l) => ({
      source: l.from_id,
      target: l.to_id,
      type: l.relation_type,
    }));

    setNodes(graphNodes);
    setLinks(graphLinks);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const relationTypes = useMemo(
    () => Array.from(new Set(links.map((link) => link.type))).sort(),
    [links]
  );

  const filteredLinks = useMemo(() => {
    if (relationTypeFilter.length === 0) return links;
    const allowed = new Set(relationTypeFilter);
    return links.filter((link) => allowed.has(link.type));
  }, [links, relationTypeFilter]);

  const filteredNodes = useMemo(() => {
    const linkedIds = new Set<string>();
    for (const link of filteredLinks) {
      linkedIds.add(link.source);
      linkedIds.add(link.target);
    }

    return nodes.filter((node) => {
      if (entityTypeFilter.length > 0 && !entityTypeFilter.includes(node.type)) {
        return false;
      }
      return linkedIds.size === 0 || linkedIds.has(node.id);
    });
  }, [entityTypeFilter, filteredLinks, nodes]);

  const filteredNodeIds = useMemo(
    () => new Set(filteredNodes.map((node) => node.id)),
    [filteredNodes]
  );

  const visibleLinks = useMemo(
    () =>
      filteredLinks.filter(
        (link) => filteredNodeIds.has(link.source) && filteredNodeIds.has(link.target)
      ),
    [filteredLinks, filteredNodeIds]
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedEntityId) ?? null,
    [nodes, selectedEntityId]
  );
  const selectedNodeVisible = selectedNode
    ? filteredNodeIds.has(selectedNode.id)
    : false;
  const hasActiveFilters =
    entityTypeFilter.length > 0 || relationTypeFilter.length > 0;

  const requestViewCommand = (type: GraphViewCommand) => {
    setViewCommand({ type, nonce: Date.now() });
  };

  const resetFilters = () => {
    setEntityTypeFilter([]);
    setRelationTypeFilter([]);
  };

  const toggleEntityType = (type: string) => {
    setEntityTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((value) => value !== type) : [...prev, type]
    );
  };

  const toggleRelationType = (type: string) => {
    setRelationTypeFilter((prev) =>
      prev.includes(type) ? prev.filter((value) => value !== type) : [...prev, type]
    );
  };

  // ESC key handler
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(42, 38, 34, 0.28)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl h-[80vh] sw-glass-heavy rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-5 py-3 border-b border-sw-border-subtle">
          <div className="flex items-center gap-2">
            <Network className="size-4 text-sw-accent" />
            <span className="text-[13px] font-black text-sw-text-primary">관계 미리보기</span>
            <span className="rounded-full border border-sw-border-default bg-sw-bg-raised px-2 py-0.5 text-[10px] font-bold text-sw-text-muted">
              승인된 관계 기준
            </span>
            {!loading && (
              <span
                className="text-[11px] text-sw-text-ghost sw-mono"
                title="승인된 관계에 직접 연결된 항목만 그래프에 표시됩니다."
              >
                표시 {filteredNodes.length}/{nodes.length}개 항목 · 관계 {visibleLinks.length}/{links.length}개
              </span>
            )}
            {selectedNode && (
              <span
                className="ml-1 inline-flex h-6 items-center rounded-full px-2 text-[10px] font-bold"
                style={{
                  background: selectedNodeVisible
                    ? "var(--sw-bg-active)"
                    : "rgba(163, 90, 69, 0.12)",
                  border: selectedNodeVisible
                    ? "1px solid var(--sw-border-focus)"
                    : "1px solid rgba(163, 90, 69, 0.24)",
                  color: selectedNodeVisible
                    ? "var(--sw-accent)"
                    : "var(--sw-danger)",
                }}
              >
                선택: {selectedNode.name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => requestViewCommand("fit")}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] font-bold text-sw-text-muted transition-colors hover:text-sw-text-primary"
              style={{ background: "var(--sw-bg-raised)", border: "1px solid var(--sw-border-muted)" }}
              title="그래프를 화면에 맞춥니다"
            >
              <LocateFixed className="size-3" />
              화면 맞춤
            </button>
            <button
              type="button"
              onClick={() => requestViewCommand("reset")}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] font-bold text-sw-text-muted transition-colors hover:text-sw-text-primary"
              style={{ background: "var(--sw-bg-raised)", border: "1px solid var(--sw-border-muted)" }}
              title="그래프 위치와 확대를 초기화합니다"
            >
              <RefreshCw className="size-3" />
              시점 초기화
            </button>
            <button
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-lg text-sw-text-dim hover:text-sw-text-primary transition-colors"
              style={{ background: "var(--sw-bg-raised)", border: "1px solid var(--sw-border-muted)" }}
              title="닫기"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="absolute left-0 right-0 top-12 z-10 border-b border-sw-border-subtle px-4 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sw-text-ghost">
              분류
            </span>
            {Object.entries(ENTITY_TYPE_CONFIG).map(([type, config]) => {
              const active = entityTypeFilter.includes(type);
              const count = nodes.filter((node) => node.type === type).length;
              if (count === 0) return null;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleEntityType(type)}
                  className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-bold"
                  style={{
                    background: active ? config.accent : "var(--sw-bg-raised)",
                    border: `1px solid ${active ? config.color : "var(--sw-border-muted)"}`,
                    color: active ? config.color : "var(--sw-text-muted)",
                  }}
                >
                  <span>{config.icon}</span>
                  {config.label}
                  <span className="sw-mono opacity-60">{count}</span>
                </button>
              );
            })}
            {entityTypeFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setEntityTypeFilter([])}
                className="h-6 rounded-full px-2 text-[10px] font-bold text-sw-text-ghost"
              >
                분류 필터 해제
              </button>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.08em] text-sw-text-ghost">
              관계
            </span>
            {relationTypes.map((type) => {
              const active = relationTypeFilter.includes(type);
              const color = RELATION_COLORS[type] ?? "#94a3b8";
              const count = links.filter((link) => link.type === type).length;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleRelationType(type)}
                  className="inline-flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-bold"
                  style={{
                    background: active ? `${color}24` : "var(--sw-bg-raised)",
                    border: `1px solid ${active ? color : "var(--sw-border-muted)"}`,
                    color: active ? color : "var(--sw-text-muted)",
                  }}
                >
                  <span className="size-1.5 rounded-full" style={{ background: color }} />
                  {RELATION_TYPE_LABELS[type] ?? type}
                  <span className="sw-mono opacity-60">{count}</span>
                </button>
              );
            })}
            {relationTypes.length === 0 && (
              <span className="text-[10px] text-sw-text-ghost">아직 관계가 없습니다.</span>
            )}
            {relationTypeFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setRelationTypeFilter([])}
                className="h-6 rounded-full px-2 text-[10px] font-bold text-sw-text-ghost"
              >
                관계 필터 해제
              </button>
            )}
          </div>
        </div>

        <div className="absolute inset-0 pt-[118px]">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-6 animate-spin text-sw-text-ghost" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-sw-danger">{error}</p>
              <button
                type="button"
                onClick={loadData}
                className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[11px] font-bold text-sw-text-muted transition-colors hover:text-sw-text-primary"
                style={{
                  background: "var(--sw-bg-raised)",
                  border: "1px solid var(--sw-border-muted)",
                }}
              >
                <RefreshCw className="size-3" />
                다시 시도
              </button>
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <span className="text-3xl opacity-30">◎</span>
              <p className="text-sm text-sw-text-muted">아직 작품 기억 항목이 없습니다.</p>
            </div>
          ) : filteredNodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="text-3xl opacity-30">◎</span>
              <p className="text-sm text-sw-text-muted">필터에 맞는 항목이 없습니다.</p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-8 rounded-md px-3 text-[11px] font-bold text-sw-text-muted transition-colors hover:text-sw-text-primary"
                  style={{
                    background: "var(--sw-bg-raised)",
                    border: "1px solid var(--sw-border-muted)",
                  }}
                >
                  필터 해제
                </button>
              )}
            </div>
          ) : (
            <CodexForceGraph
              nodes={filteredNodes}
              links={visibleLinks}
              selectedEntityId={selectedEntityId}
              onNodeSelect={onSelectEntity}
              viewCommand={viewCommand}
            />
          )}
        </div>

        {/* Hint */}
        {!loading && nodes.length > 0 && (
          <div className="absolute bottom-3 right-4 text-[10px] text-sw-text-ghost pointer-events-none">
            드래그로 이동 · 스크롤로 확대/축소 · 항목 클릭으로 상세 보기
          </div>
        )}
      </div>
    </div>
  );
}
