"use client";

import { useCallback, useMemo, useState } from "react";
import { CodexDetailPanel } from "@/components/codex-detail-panel";
import { CodexEntityList } from "@/components/codex-full-page/codex-entity-list";
import { CodexFullPageHeader } from "@/components/codex-full-page/codex-full-page-header";
import { CodexPageStyles } from "@/components/codex-full-page/codex-page-styles";
import { TYPE_GROUPS } from "@/components/codex-full-page/constants";
import type {
  CodexFullPageProps,
  EnrichedEntity,
  SortOption,
} from "@/components/codex-full-page/types";
import { CreateEntityDialog } from "@/components/create-entity-dialog";
import { CodexGraphModal } from "@/components/write/codex-graph-modal";

export function CodexFullPage({
  projectId,
  projectTitle,
  entities,
  pendingEntities,
  links,
  relationEvidence,
  entityChapters,
  entityEvidence,
  entityForeshadows,
  entityFacts,
  pendingSuggestions,
  unmatchedSuggestionCount,
  totalChapters,
}: CodexFullPageProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"review" | "duplicate" | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("relations");
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);

  const relationCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const link of links) {
      map.set(link.from_id, (map.get(link.from_id) ?? 0) + 1);
      map.set(link.to_id, (map.get(link.to_id) ?? 0) + 1);
    }
    return map;
  }, [links]);

  const duplicateNames = useMemo(() => {
    const nameTypeMap = new Map<string, Set<string>>();
    for (const e of entities) {
      const set = nameTypeMap.get(e.name) ?? new Set();
      set.add(e.type);
      nameTypeMap.set(e.name, set);
    }
    const dups = new Set<string>();
    for (const [name, types] of nameTypeMap) {
      if (types.size > 1) dups.add(name);
    }
    return dups;
  }, [entities]);

  const enrichedEntities = useMemo<EnrichedEntity[]>(() => {
    const confirmed: EnrichedEntity[] = entities.map((e) => {
      const aliasArray = Array.isArray(e.aliases) ? (e.aliases as string[]) : [];
      const relationCount = relationCountMap.get(e.id) ?? 0;
      const chapters = entityChapters[e.id] ?? [];
      let firstChapter = chapters.length > 0
        ? Math.min(...chapters.map((c) => c.chapterNum))
        : null;
      if (firstChapter === null && e.metadata) {
        const meta = e.metadata as Record<string, unknown>;
        const fc = Number(meta.first_chapter);
        if (!isNaN(fc) && fc > 0) firstChapter = fc;
      }
      const pendingCount = pendingSuggestions[e.id] ?? 0;
      const isDuplicate = duplicateNames.has(e.name);
      const status: EnrichedEntity["status"] = isDuplicate
        ? "warning"
        : pendingCount > 0
          ? "review"
          : "confirmed";

      return {
        ...e,
        kind: "entity" as const,
        aliasArray,
        relationCount,
        firstChapter,
        status,
        pendingCount,
        isDuplicate,
      };
    });

    // `id` here is an entity_suggestions row, not an entities row — hence `kind`.
    const pending: EnrichedEntity[] = pendingEntities.map((s) => ({
      id: s.id,
      kind: "suggestion" as const,
      name: s.name,
      type: s.type,
      summary: s.summary,
      aliases: s.aliases,
      aliasArray: Array.isArray(s.aliases) ? (s.aliases as string[]) : [],
      relationCount: 0,
      firstChapter: s.chapterNum,
      status: "review" as const,
      pendingCount: 1,
      isDuplicate: false,
    }));

    return [...confirmed, ...pending];
  }, [entities, pendingEntities, relationCountMap, entityChapters, pendingSuggestions, duplicateNames]);

  const filteredEntities = useMemo(() => {
    let result = enrichedEntities;

    if (typeFilter) {
      const group = TYPE_GROUPS.find((g) => g.key === typeFilter);
      if (group) {
        result = result.filter((e) => (group.types as readonly string[]).includes(e.type));
      }
    }

    if (statusFilter === "review") {
      result = result.filter((e) => e.status === "review");
    } else if (statusFilter === "duplicate") {
      result = result.filter((e) => e.isDuplicate);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.aliasArray.some((a) => a.toLowerCase().includes(q)) ||
          (e.summary ?? "").toLowerCase().includes(q)
      );
    }

    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "relations":
          return b.relationCount - a.relationCount;
        case "recent":
          return (b.firstChapter ?? 0) - (a.firstChapter ?? 0);
        case "name":
          return a.name.localeCompare(b.name, "ko");
        case "chapter":
          return (a.firstChapter ?? 999) - (b.firstChapter ?? 999);
        default:
          return 0;
      }
    });

    return result;
  }, [enrichedEntities, typeFilter, statusFilter, searchQuery, sortBy]);

  const groupedEntities = useMemo(() => {
    return TYPE_GROUPS.map((group) => ({
      ...group,
      entities: filteredEntities.filter((e) => (group.types as readonly string[]).includes(e.type)),
    })).filter((g) => g.entities.length > 0);
  }, [filteredEntities]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const group of TYPE_GROUPS) {
      counts[group.key] = enrichedEntities.filter((e) =>
        (group.types as readonly string[]).includes(e.type)
      ).length;
    }
    return counts;
  }, [enrichedEntities]);

  const reviewCount = useMemo(
    () => enrichedEntities.filter((e) => e.status === "review").length,
    [enrichedEntities]
  );
  const duplicateCount = useMemo(
    () => enrichedEntities.filter((e) => e.isDuplicate).length,
    [enrichedEntities]
  );

  const selectedEntity = useMemo(
    () => enrichedEntities.find((e) => e.id === selectedEntityId) ?? null,
    [enrichedEntities, selectedEntityId]
  );

  const selectedEntityLinks = useMemo(() => {
    if (!selectedEntityId) return [];
    return links.filter(
      (l) => l.from_id === selectedEntityId || l.to_id === selectedEntityId
    );
  }, [links, selectedEntityId]);

  const handleEntityClick = useCallback((entityId: string) => {
    setSelectedEntityId(entityId);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedEntityId(null);
  }, []);

  const handleDeleted = useCallback(() => {
    setSelectedEntityId(null);
  }, []);

  return (
    <div className="flex flex-col absolute inset-0 overflow-hidden" style={{ background: "var(--sw-bg-base)" }}>
      <CodexFullPageHeader
        projectTitle={projectTitle}
        totalChapters={totalChapters}
        unmatchedSuggestionCount={unmatchedSuggestionCount}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        totalEntityCount={enrichedEntities.length}
        filteredEntityCount={filteredEntities.length}
        typeCounts={typeCounts}
        reviewCount={reviewCount}
        duplicateCount={duplicateCount}
        onGraphOpen={() => setGraphOpen(true)}
        onCreateOpen={() => setCreateOpen(true)}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <CodexEntityList
          filteredEntities={filteredEntities}
          groupedEntities={groupedEntities}
          viewMode={viewMode}
          searchQuery={searchQuery}
          typeFilter={typeFilter}
          statusFilter={statusFilter}
          selectedEntityId={selectedEntityId}
          onEntityClick={handleEntityClick}
        />

        {selectedEntity && (
          <CodexDetailPanel
            entity={selectedEntity}
            kind={selectedEntity.kind}
            entityLinks={selectedEntityLinks}
            relationEvidence={relationEvidence}
            allEntities={entities}
            chapters={entityChapters[selectedEntity.id] ?? []}
            evidence={entityEvidence[selectedEntity.id] ?? []}
            foreshadows={entityForeshadows[selectedEntity.id] ?? []}
            facts={entityFacts[selectedEntity.id] ?? []}
            status={selectedEntity.status}
            firstChapter={selectedEntity.firstChapter}
            projectId={projectId}
            onClose={handleCloseDetail}
            onEntityClick={handleEntityClick}
            onDeleted={handleDeleted}
          />
        )}
      </div>

      <CreateEntityDialog
        projectId={projectId}
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      {graphOpen && (
        <CodexGraphModal projectId={projectId} onClose={() => setGraphOpen(false)} />
      )}

      <CodexPageStyles />
    </div>
  );
}
