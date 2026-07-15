"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  deleteEntity,
  deleteEntityLink,
  getCodexData,
  updateEntityInline,
} from "@/app/(dashboard)/projects/[id]/codex-actions";
import { toast } from "sonner";
import { CodexGraphModal } from "./codex-graph-modal";
import { CodexEntityList } from "./codex-entity-list";
import { CodexEmptyState, CodexLoadingState } from "./codex-panel-empty-states";
import { CodexPanelSearch } from "./codex-panel-search";
import { CodexRecentEntities } from "./codex-recent-entities";
import { CodexTypeFilters } from "./codex-type-filters";
import type { CodexFieldValue, EnrichedEntity, EnrichedLink } from "./codex-panel-types";

export function CodexPanel({
  projectId,
  saveSignal,
  selectedEntityId,
  onSelectedEntityChange,
  onSelectChapter,
}: {
  projectId: string;
  saveSignal?: number;
  selectedEntityId?: string | null;
  onSelectedEntityChange?: (entityId: string | null) => void;
  onSelectChapter?: (chapterId: string) => void;
}) {
  const [entities, setEntities] = useState<EnrichedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [selectedEntity, setSelectedEntity] = useState<EnrichedEntity | null>(null);
  const [graphModalOpen, setGraphModalOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedEntity && detailRef.current) {
      detailRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedEntity?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = useCallback(async () => {
    const result = await getCodexData(projectId);
    if (result.error) {
      toast.error(result.error);
      setLoading(false);
      return;
    }

    const enriched: EnrichedEntity[] = result.entities.map((entity) => {
      const entityLinks: EnrichedLink[] = result.links
        .filter((link) => link.from_id === entity.id || link.to_id === entity.id)
        .map((link) => {
          const isFrom = link.from_id === entity.id;
          return {
            id: link.id,
            relatedId: isFrom ? link.to_id : link.from_id,
            relatedName: isFrom ? link.to_name : link.from_name,
            relationType: link.relation_type,
            direction: link.direction,
            isFrom,
          };
        });

      return {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        summary: entity.summary,
        aliases: Array.isArray(entity.aliases) ? (entity.aliases as string[]) : [],
        links: entityLinks,
        chapters: result.entityChapters[entity.id] ?? [],
        facts: result.entityFacts[entity.id] ?? [],
      };
    });

    setEntities(enriched);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchData();
  }, [fetchData, saveSignal]);

  useEffect(() => {
    if (!selectedEntity) return;

    const updated = entities.find((entity) => entity.id === selectedEntity.id);
    if (updated) {
      setSelectedEntity(updated);
    } else {
      setSelectedEntity(null);
    }
  }, [entities]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedEntityId) return;

    const entity = entities.find((candidate) => candidate.id === selectedEntityId);
    if (!entity) return;

    setSearch("");
    setTypeFilter("ALL");
    setSelectedEntity(entity);
  }, [entities, selectedEntityId]);

  const filteredEntities = useMemo(() => {
    return entities.filter((entity) => {
      if (typeFilter !== "ALL" && entity.type !== typeFilter) return false;
      if (search) {
        const query = search.toLowerCase();
        if (
          !entity.name.toLowerCase().includes(query) &&
          !entity.aliases.some((alias) => alias.toLowerCase().includes(query))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [entities, typeFilter, search]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    entities.forEach((entity) => {
      counts[entity.type] = (counts[entity.type] || 0) + 1;
    });
    return counts;
  }, [entities]);

  const recentEntities = useMemo(() => {
    if (entities.length === 0) return [];

    return [...entities]
      .filter((entity) => entity.chapters.length > 0)
      .sort((a, b) => {
        const latestA = Math.max(...a.chapters.map((chapter) => chapter.chapterNum));
        const latestB = Math.max(...b.chapters.map((chapter) => chapter.chapterNum));
        return latestB - latestA;
      })
      .slice(0, 6);
  }, [entities]);

  function handleSelectEntity(entity: EnrichedEntity | null) {
    setSelectedEntity(entity);
    onSelectedEntityChange?.(entity?.id ?? null);
  }

  function handleFieldSave(entityId: string, field: string, value: CodexFieldValue) {
    const oldEntities = entities.map((entity) => ({ ...entity }));

    setEntities((previous) =>
      previous.map((entity) => (entity.id === entityId ? { ...entity, [field]: value } : entity))
    );

    startTransition(async () => {
      const result = await updateEntityInline(entityId, projectId, {
        [field]: value,
      });
      if (result.error) {
        setEntities(oldEntities);
        toast.error(result.error);
      }
    });
  }

  function handleDeleteLink(linkId: string, entityId: string) {
    const oldEntities = entities.map((entity) => ({
      ...entity,
      links: [...entity.links],
    }));

    setEntities((previous) =>
      previous.map((entity) => ({
        ...entity,
        links: entity.links.filter((link) => link.id !== linkId),
      }))
    );

    startTransition(async () => {
      const result = await deleteEntityLink(linkId, projectId, entityId);
      if (result.error) {
        setEntities(oldEntities);
        toast.error(result.error);
      }
    });
  }

  function handleDeleteEntity(entityId: string) {
    const oldEntities = [...entities];

    setEntities((previous) => previous.filter((entity) => entity.id !== entityId));
    setSelectedEntity(null);
    onSelectedEntityChange?.(null);

    startTransition(async () => {
      const result = await deleteEntity(entityId, projectId);
      if (result.error) {
        setEntities(oldEntities);
        toast.error(result.error);
      } else {
        toast.success("작품 기억에서 삭제되었습니다");
      }
    });
  }

  if (loading) {
    return <CodexLoadingState />;
  }

  if (entities.length === 0) {
    return <CodexEmptyState />;
  }

  return (
    <div className="relative flex h-full flex-col gap-2">
      {graphModalOpen && (
        <CodexGraphModal
          projectId={projectId}
          selectedEntityId={selectedEntity?.id ?? selectedEntityId}
          onSelectEntity={(entityId) => {
            const entity = entities.find((candidate) => candidate.id === entityId);
            if (!entity) return;
            setSearch("");
            setTypeFilter("ALL");
            setSelectedEntity(entity);
            onSelectedEntityChange?.(entityId);
          }}
          onClose={() => setGraphModalOpen(false)}
        />
      )}

      <CodexPanelSearch search={search} onSearchChange={setSearch} />

      <CodexTypeFilters
        totalCount={entities.length}
        typeCounts={typeCounts}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
      />

      {recentEntities.length > 0 && typeFilter === "ALL" && !search && (
        <CodexRecentEntities entities={recentEntities} onSelectEntity={handleSelectEntity} />
      )}

      <CodexEntityList
        entities={filteredEntities}
        selectedEntity={selectedEntity}
        typeFilter={typeFilter}
        detailRef={detailRef}
        isPending={isPending}
        onGraphOpen={() => setGraphModalOpen(true)}
        onSelectEntity={handleSelectEntity}
        onCloseDetail={() => handleSelectEntity(null)}
        onFieldSave={handleFieldSave}
        onDeleteLink={handleDeleteLink}
        onDeleteEntity={handleDeleteEntity}
        onSelectChapter={onSelectChapter}
      />
    </div>
  );
}
