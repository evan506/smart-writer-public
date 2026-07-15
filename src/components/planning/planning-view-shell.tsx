"use client";

import { useMemo, useState } from "react";
import { Layers3, Network } from "lucide-react";
import { PlanningWorkspace } from "@/components/planning/planning-workspace";
import {
  PlotThreadMatrixView,
  type PlotThreadLinkableBlock,
} from "@/components/planning/plot-thread/plot-thread-matrix-view";
import type { PlanningLinkedEntity } from "@/lib/services/planning/read.service";
import type {
  PlotThreadChapterColumn,
  PlotThreadMatrix,
  PlotThreadSummary,
} from "@/lib/services/plot-thread/read.service";
import type { CodexFact } from "@/lib/services/canon-facts/read.service";
import { PLOT_THREAD_COPY } from "@/lib/planning/plot-thread-constants";
import { isPlotThreadRowKind } from "@/lib/planning/plot-thread-constants";
import type { Chapter, PlanningBlock } from "@/types";

type ChapterRef = { id: string; planning_block_id: string; target_id: string };

interface PlanningViewShellProps {
  projectId: string;
  projectTitle: string;
  initialBlocks: PlanningBlock[];
  chapters: Array<Pick<Chapter, "id" | "chapter_num" | "title" | "updated_at">>;
  chapterReferences: ChapterRef[];
  availableEntities: PlanningLinkedEntity[];
  entityReferences: ChapterRef[];
  linkedEntities: PlanningLinkedEntity[];
  factsByEntityId: Record<string, CodexFact[]>;
  plotThreads: PlotThreadSummary[];
  plotThreadMatrices: Record<string, PlotThreadMatrix>;
}

type ViewKey = "tree" | "threads";

export function PlanningViewShell(props: PlanningViewShellProps) {
  const [view, setView] = useState<ViewKey>("tree");

  const matrixChapters: PlotThreadChapterColumn[] = useMemo(
    () =>
      props.chapters.map((c) => ({
        id: c.id,
        chapterNum: c.chapter_num,
        title: c.title,
      })),
    [props.chapters]
  );

  const linkableBlocks: PlotThreadLinkableBlock[] = useMemo(() => {
    const byId = new Map(props.initialBlocks.map((b) => [b.id, b]));
    function pathLabel(block: PlanningBlock): string {
      const titles: string[] = [];
      let current: PlanningBlock | undefined = block;
      let guard = 0;
      while (current && guard < 32) {
        titles.unshift(current.title);
        current = current.parent_id ? byId.get(current.parent_id) : undefined;
        guard += 1;
      }
      return titles.join(" / ");
    }
    return props.initialBlocks
      .filter((b) => isPlotThreadRowKind(b.kind))
      .map((b) => ({
        id: b.id,
        title: b.title,
        kind: b.kind,
        pathLabel: pathLabel(b),
      }));
  }, [props.initialBlocks]);

  return (
    <div className="min-h-screen bg-sw-bg-base text-sw-text-primary">
      <div
        role="tablist"
        aria-label="구상 보기 전환"
        className="flex items-center gap-2 border-b border-sw-border-default bg-sw-bg-surface px-4 py-2.5 sm:px-6"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "tree"}
          onClick={() => setView("tree")}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors ${
            view === "tree"
              ? "bg-sw-accent-bg text-sw-accent"
              : "text-sw-text-muted hover:text-sw-accent"
          }`}
        >
          <Layers3 className="size-4" />
          구상 트리
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "threads"}
          onClick={() => setView("threads")}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-bold transition-colors ${
            view === "threads"
              ? "bg-sw-accent-bg text-sw-accent"
              : "text-sw-text-muted hover:text-sw-accent"
          }`}
        >
          <Network className="size-4" />
          {PLOT_THREAD_COPY.sectionEyebrow}
        </button>
      </div>

      {view === "tree" ? (
        <PlanningWorkspace
          projectId={props.projectId}
          projectTitle={props.projectTitle}
          initialBlocks={props.initialBlocks}
          chapters={props.chapters}
          chapterReferences={props.chapterReferences}
          availableEntities={props.availableEntities}
          entityReferences={props.entityReferences}
          linkedEntities={props.linkedEntities}
          factsByEntityId={props.factsByEntityId}
        />
      ) : (
        <div className="px-4 py-5 sm:px-6">
          <header className="mb-4">
            <p className="text-xs font-bold text-sw-accent">
              {PLOT_THREAD_COPY.sectionEyebrow}
            </p>
            <h1 className="mt-1 text-2xl font-bold">
              {PLOT_THREAD_COPY.matrixTitle}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-sw-text-secondary">
              작가가 정의한 이야기 흐름을 회차, 원문 근거, 작품 기억과 나란히
              살펴봅니다. 표시된 연결은 판단이 아니라 탐색을 위한 근거입니다.
            </p>
            <p className="mt-2 inline-block rounded-md border border-sw-accent-border bg-sw-accent-bg px-3 py-1.5 text-xs font-semibold text-sw-accent">
              {PLOT_THREAD_COPY.boundaryNotice}
            </p>
          </header>
          <PlotThreadMatrixView
            projectId={props.projectId}
            threads={props.plotThreads}
            chapters={matrixChapters}
            matrices={props.plotThreadMatrices}
            linkableBlocks={linkableBlocks}
            onSwitchToTree={() => setView("tree")}
          />
        </div>
      )}
    </div>
  );
}
