"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Layers3,
  Lightbulb,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createPlanningChildBlock,
  deletePlanningBlock,
  linkPlanningBlockToChapter,
  linkPlanningBlockToEntity,
  unlinkPlanningBlockFromChapter,
  unlinkPlanningBlockFromEntity,
  updatePlanningBlock,
} from "@/app/(dashboard)/projects/[id]/planning-actions";
import type { CodexFact } from "@/lib/services/canon-facts/read.service";
import type { PlanningLinkedEntity } from "@/lib/services/planning/read.service";
import {
  PLANNING_CHILD_KIND_OPTIONS,
  PLANNING_STATUS_LABELS,
} from "@/lib/planning/constants";
import type {
  Chapter,
  PlanningBlock,
  PlanningBlockKind,
  PlanningBlockStatus,
} from "@/types";
import type { PendingAction, PlanningNotice } from "./planning-workspace/types";
import {
  getChildColumnTitle,
  getPathLabel,
  getPlanningPath,
} from "./planning-workspace/format";
import { ChapterReferenceSection } from "./planning-workspace/chapter-reference-section";
import { LinkedMemorySection } from "./planning-workspace/linked-memory-section";
import { PlanningNoticeBox } from "./planning-workspace/planning-notice-box";
import { PlanningDropdown } from "./planning-workspace/planning-dropdown";
import { PlanningColumn } from "./planning-workspace/planning-column";

interface PlanningWorkspaceProps {
  projectId: string;
  projectTitle: string;
  initialBlocks: PlanningBlock[];
  chapters: Array<
    Pick<Chapter, "id" | "chapter_num" | "title" | "updated_at">
  >;
  chapterReferences: Array<{
    id: string;
    planning_block_id: string;
    target_id: string;
  }>;
  availableEntities: PlanningLinkedEntity[];
  entityReferences: Array<{
    id: string;
    planning_block_id: string;
    target_id: string;
  }>;
  linkedEntities: PlanningLinkedEntity[];
  factsByEntityId: Record<string, CodexFact[]>;
}

type ChildKind = Exclude<PlanningBlockKind, "ROOT">;

const statusOptions = Object.entries(PLANNING_STATUS_LABELS) as Array<
  [PlanningBlockStatus, string]
>;
const statusDropdownOptions = statusOptions.map(([value, label]) => ({
  value,
  label,
}));
const childKindDropdownOptions = PLANNING_CHILD_KIND_OPTIONS.map((option) => ({
  value: option.kind,
  label: option.label,
}));

export function PlanningWorkspace({
  projectId,
  projectTitle,
  initialBlocks,
  chapters,
  chapterReferences,
  availableEntities,
  entityReferences,
  linkedEntities,
  factsByEntityId,
}: PlanningWorkspaceProps) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(initialBlocks[0]?.id ?? null);
  const [editingBlock, setEditingBlock] = useState<PlanningBlock | null>(null);
  const [childKind, setChildKind] = useState<ChildKind>("EPISODE");
  const [childTitle, setChildTitle] = useState("");
  const [childSummary, setChildSummary] = useState("");
  const [chapterReferenceId, setChapterReferenceId] = useState("");
  const [entityReferenceId, setEntityReferenceId] = useState("");
  const [notice, setNotice] = useState<PlanningNotice | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [isPending, startTransition] = useTransition();

  const rootBlocks = useMemo(
    () =>
      initialBlocks
        .filter((block) => block.parent_id === null)
        .sort((a, b) => a.position - b.position),
    [initialBlocks]
  );

  const blockById = useMemo(() => {
    const map = new Map<string, PlanningBlock>();
    for (const block of initialBlocks) map.set(block.id, block);
    return map;
  }, [initialBlocks]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string, PlanningBlock[]>();
    for (const block of initialBlocks) {
      if (!block.parent_id) continue;
      const list = map.get(block.parent_id) ?? [];
      list.push(block);
      map.set(block.parent_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.position - b.position);
    }
    return map;
  }, [initialBlocks]);

  const selectedBlock =
    (selectedId ? blockById.get(selectedId) : null) ?? rootBlocks[0] ?? null;
  const selectedPath = useMemo(
    () =>
      selectedBlock ? getPlanningPath(selectedBlock, blockById).reverse() : [],
    [blockById, selectedBlock]
  );
  const selectedChildren = selectedBlock
    ? childrenByParent.get(selectedBlock.id) ?? []
    : [];
  const selectedChapterReferences = selectedBlock
    ? chapterReferences.filter((link) => link.planning_block_id === selectedBlock.id)
    : [];
  const selectedReferencedChapters = selectedChapterReferences
    .map((link) => chapters.find((chapter) => chapter.id === link.target_id))
    .filter((chapter): chapter is Pick<Chapter, "id" | "chapter_num" | "title" | "updated_at"> => Boolean(chapter));
  const selectedEntityReferences = selectedBlock
    ? entityReferences.filter((link) => link.planning_block_id === selectedBlock.id)
    : [];
  const linkedEntityById = useMemo(
    () => new Map(linkedEntities.map((entity) => [entity.id, entity])),
    [linkedEntities]
  );
  const selectedLinkedEntities = selectedEntityReferences
    .map((link) => linkedEntityById.get(link.target_id))
    .filter((entity): entity is PlanningLinkedEntity => Boolean(entity));
  const selectedLinkedEntityIds = new Set(
    selectedLinkedEntities.map((entity) => entity.id)
  );
  const availableEntityOptions = availableEntities.filter(
    (entity) => !selectedLinkedEntityIds.has(entity.id)
  );
  const selectedIsRoot = selectedBlock?.parent_id === null;
  const selectedCanReferenceChapter = selectedBlock?.kind === "CHAPTER";
  const draft = editingBlock?.id === selectedBlock?.id ? editingBlock : selectedBlock;

  const drilldownColumns = useMemo(() => {
    if (!selectedBlock) return [];
    const columns: Array<{
      id: string;
      title: string;
      description: string;
      cards: PlanningBlock[];
      parent: PlanningBlock | null;
    }> = [
      {
        id: "roots",
        title: "기본 4블록",
        description: "처음부터 제공되는 최소 구조",
        cards: rootBlocks,
        parent: null,
      },
    ];

    for (const parent of selectedPath) {
      columns.push({
        id: parent.id,
        title: getChildColumnTitle(parent),
        description:
          parent.kind === "ROOT"
            ? "선택한 기본 블록에 묶인 하위 카드"
            : "선택한 카드 아래로 필요한 만큼만 확장",
        cards: childrenByParent.get(parent.id) ?? [],
        parent,
      });
    }

    return columns;
  }, [childrenByParent, rootBlocks, selectedBlock, selectedPath]);

  function selectBlock(block: PlanningBlock) {
    setSelectedId(block.id);
    setChapterReferenceId("");
    setEntityReferenceId("");
    beginEdit(block);
  }

  function beginEdit(block: PlanningBlock) {
    setNotice(null);
    setEditingBlock({ ...block });
  }

  function updateDraft(field: keyof PlanningBlock, value: string) {
    if (!draft) return;
    setEditingBlock({ ...draft, [field]: value });
  }

  function saveSelectedBlock() {
    if (!draft) return;
    setPendingAction("save");
    startTransition(async () => {
      const result = await updatePlanningBlock({
        blockId: draft.id,
        projectId,
        title: draft.title,
        summary: draft.summary,
        notes: draft.notes,
        status: draft.status as PlanningBlockStatus,
      });
      setNotice({
        tone: result.error ? "error" : "success",
        text: result.error ?? "구상을 저장했습니다.",
      });
      if (!result.error) {
        setEditingBlock(null);
        router.refresh();
      }
      setPendingAction(null);
    });
  }

  function createChild() {
    if (!selectedBlock || !childTitle.trim()) {
      setNotice({ tone: "error", text: "추가할 카드 제목을 입력해주세요." });
      return;
    }

    setPendingAction("create");
    startTransition(async () => {
      const result = await createPlanningChildBlock({
        projectId,
        parentId: selectedBlock.id,
        kind: childKind,
        title: childTitle,
        summary: childSummary,
      });
      setNotice({
        tone: result.error ? "error" : "success",
        text: result.error ?? "하위 구상 카드를 추가했습니다.",
      });
      if (!result.error) {
        setChildTitle("");
        setChildSummary("");
        if (result.id) setSelectedId(result.id);
        router.refresh();
      }
      setPendingAction(null);
    });
  }

  function deleteSelectedBlock() {
    if (!selectedBlock || selectedIsRoot) return;
    const parentId = selectedBlock.parent_id;

    setPendingAction("delete");
    startTransition(async () => {
      const result = await deletePlanningBlock({ projectId, blockId: selectedBlock.id });
      setNotice({
        tone: result.error ? "error" : "success",
        text: result.error ?? "구상 카드를 삭제했습니다.",
      });
      if (!result.error) {
        setSelectedId(parentId ?? rootBlocks[0]?.id ?? null);
        setEditingBlock(null);
        router.refresh();
      }
      setPendingAction(null);
    });
  }

  function linkChapterReference() {
    if (!selectedBlock || !chapterReferenceId) {
      setNotice({ tone: "error", text: "참조할 기존 회차를 선택해주세요." });
      return;
    }

    setPendingAction("link");
    startTransition(async () => {
      const result = await linkPlanningBlockToChapter({
        projectId,
        planningBlockId: selectedBlock.id,
        chapterId: chapterReferenceId,
      });
      setNotice({
        tone: result.error ? "error" : "success",
        text: result.error ?? "기존 회차를 참조했습니다.",
      });
      if (!result.error) {
        setChapterReferenceId("");
        router.refresh();
      }
      setPendingAction(null);
    });
  }

  function unlinkChapterReference(chapterId: string) {
    if (!selectedBlock) return;

    setPendingAction("unlink");
    startTransition(async () => {
      const result = await unlinkPlanningBlockFromChapter({
        projectId,
        planningBlockId: selectedBlock.id,
        chapterId,
      });
      setNotice({
        tone: result.error ? "error" : "success",
        text: result.error ?? "기존 회차 참조를 해제했습니다.",
      });
      if (!result.error) router.refresh();
      setPendingAction(null);
    });
  }

  function linkEntityReference() {
    if (!selectedBlock || !entityReferenceId) {
      setNotice({ tone: "error", text: "연결할 작품 기억을 선택해주세요." });
      return;
    }

    setPendingAction("link");
    startTransition(async () => {
      const result = await linkPlanningBlockToEntity({
        projectId,
        planningBlockId: selectedBlock.id,
        entityId: entityReferenceId,
      });
      setNotice({
        tone: result.error ? "error" : "success",
        text: result.error ?? "작품 기억을 연결했습니다.",
      });
      if (!result.error) {
        setEntityReferenceId("");
        router.refresh();
      }
      setPendingAction(null);
    });
  }

  function unlinkEntityReference(entityId: string) {
    if (!selectedBlock) return;

    setPendingAction("unlink");
    startTransition(async () => {
      const result = await unlinkPlanningBlockFromEntity({
        projectId,
        planningBlockId: selectedBlock.id,
        entityId,
      });
      setNotice({
        tone: result.error ? "error" : "success",
        text: result.error ?? "작품 기억 연결을 해제했습니다.",
      });
      if (!result.error) router.refresh();
      setPendingAction(null);
    });
  }

  return (
    <div className="min-h-screen bg-sw-bg-base text-sw-text-primary">
      <header className="border-b border-sw-border-default bg-sw-bg-surface px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold text-sw-accent">
              <Lightbulb className="size-4" />
              소설 구상 보조
            </div>
            <h1 className="text-2xl font-bold tracking-normal">구상하기</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-sw-text-secondary">
              {projectTitle}의 큰 흐름을 네 블록으로 잡고, 필요한 블록만 오른쪽으로
              단계적으로 구체화합니다.
            </p>
          </div>
          <div className="rounded-md border border-sw-accent-border bg-sw-accent-bg px-3 py-2 text-xs font-semibold text-sw-accent">
            구상은 계획이며 원고나 canon으로 자동 반영되지 않습니다.
          </div>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-126px)] grid-cols-[minmax(0,1fr)_390px] gap-4 px-4 py-4 sm:px-6 sm:py-5 xl:gap-5 max-xl:grid-cols-1">
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold">점진적 구체화</h2>
              <p className="mt-1 text-xs text-sw-text-muted">
                기본 4블록에서 출발해 선택한 카드의 하위 구조만 오른쪽 컬럼으로
                펼칩니다.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-sw-border-default bg-sw-bg-elevated px-3 py-2 text-xs text-sw-text-muted">
              <Layers3 className="size-4 text-sw-accent" />
              {initialBlocks.length}개 구상 항목
            </div>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-sw-accent-border bg-sw-accent-bg px-3 py-2 text-xs font-semibold text-sw-accent">
            <span>현재 선택:</span>
            {selectedPath.map((block, index) => (
              <span key={block.id} className="inline-flex items-center gap-2">
                {index > 0 && <ChevronRight className="size-3.5" />}
                {block.title}
              </span>
            ))}
          </div>

          <div className="overflow-visible rounded-lg border border-sw-border-default bg-sw-bg-surface/70 p-3 shadow-[0_18px_46px_rgba(61,43,22,0.08)] md:overflow-x-auto">
            <div
              className="flex w-full flex-col items-stretch gap-3 md:grid md:min-w-[760px] md:items-start"
              style={{
                gridTemplateColumns: `repeat(${Math.max(
                  drilldownColumns.length,
                  1
                )}, minmax(230px, 260px))`,
              }}
            >
              {drilldownColumns.map((column) => (
                <PlanningColumn
                  key={column.id}
                  title={column.title}
                  description={column.description}
                  cards={column.cards}
                  parent={column.parent}
                  selectedId={selectedBlock?.id ?? null}
                  childrenByParent={childrenByParent}
                  onSelect={selectBlock}
                />
              ))}
            </div>
          </div>
        </section>

        <aside className="min-w-0 rounded-lg border border-sw-border-default bg-sw-bg-surface p-4 shadow-[0_18px_46px_rgba(61,43,22,0.08)]">
          {draft && selectedBlock ? (
            <div className="flex h-full flex-col">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-sw-text-ghost">
                    {selectedIsRoot ? "선택한 기본 블록" : "선택한 구상 카드"}
                  </p>
                  <h2 className="mt-1 text-lg font-bold">{selectedBlock.title}</h2>
                  <p className="mt-1 text-xs text-sw-text-muted">
                    {getPathLabel(selectedPath)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!selectedIsRoot && (
                    <button
                      type="button"
                      onClick={deleteSelectedBlock}
                      disabled={isPending}
                      className="inline-flex min-h-9 items-center gap-2 rounded-md border border-sw-border-default px-3 text-sm font-bold text-sw-text-muted hover:border-sw-danger hover:text-sw-danger disabled:opacity-60"
                    >
                      <Trash2 className="size-4" />
                      {pendingAction === "delete" ? "삭제 중" : "삭제"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={saveSelectedBlock}
                    disabled={isPending}
                    className="inline-flex min-h-9 items-center gap-2 rounded-md border border-sw-cta bg-sw-cta px-3 text-sm font-bold text-[#fffaf1] disabled:opacity-60"
                  >
                    <Check className="size-4" />
                    {pendingAction === "save" ? "저장 중" : "저장"}
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                <label className="grid gap-1.5 text-xs font-bold text-sw-text-muted">
                  {selectedIsRoot ? "블록 이름" : "카드 제목"}
                  <input
                    value={draft.title}
                    onChange={(event) => updateDraft("title", event.target.value)}
                    className="min-h-10 rounded-md border border-sw-border-default bg-sw-bg-elevated px-3 text-sm font-semibold text-sw-text-primary outline-none focus:border-sw-border-focus"
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-bold text-sw-text-muted">
                  {selectedIsRoot ? "한 줄 구상" : "짧은 설명"}
                  <textarea
                    value={draft.summary ?? ""}
                    onChange={(event) => updateDraft("summary", event.target.value)}
                    rows={3}
                    placeholder={
                      selectedIsRoot
                        ? "이 블록에서 독자가 기억해야 할 흐름을 한 줄로 적어보세요."
                        : "이 카드에서 구체화할 내용을 짧게 적어보세요."
                    }
                    className="resize-none rounded-md border border-sw-border-default bg-sw-bg-elevated px-3 py-2 text-sm leading-6 text-sw-text-primary outline-none focus:border-sw-border-focus"
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-bold text-sw-text-muted">
                  상태
                  <PlanningDropdown
                    ariaLabel="구상 카드 상태"
                    value={draft.status}
                    onChange={(value) => updateDraft("status", value)}
                    options={statusDropdownOptions}
                  />
                </label>

                <label className="grid gap-1.5 text-xs font-bold text-sw-text-muted">
                  메모
                  <textarea
                    value={draft.notes ?? ""}
                    onChange={(event) => updateDraft("notes", event.target.value)}
                    rows={5}
                    placeholder="아직 정리되지 않은 아이디어, 질문, 회수하고 싶은 약속을 적어둘 수 있습니다."
                    className="resize-none rounded-md border border-sw-border-default bg-sw-bg-elevated px-3 py-2 text-sm leading-6 text-sw-text-primary outline-none focus:border-sw-border-focus"
                  />
                </label>
              </div>

              <div className="my-4 h-px bg-sw-border-subtle" />

              <ChapterReferenceSection
                projectId={projectId}
                selectedCanReferenceChapter={selectedCanReferenceChapter}
                chapters={chapters}
                referencedChapters={selectedReferencedChapters}
                chapterReferenceId={chapterReferenceId}
                setChapterReferenceId={setChapterReferenceId}
                isPending={isPending}
                pendingAction={pendingAction}
                onLink={linkChapterReference}
                onUnlink={unlinkChapterReference}
              />

              <div className="my-4 h-px bg-sw-border-subtle" />

              <LinkedMemorySection
                selectedIsRoot={selectedIsRoot}
                availableEntities={availableEntityOptions}
                linkedEntities={selectedLinkedEntities}
                factsByEntityId={factsByEntityId}
                entityReferenceId={entityReferenceId}
                setEntityReferenceId={setEntityReferenceId}
                isPending={isPending}
                pendingAction={pendingAction}
                onLink={linkEntityReference}
                onUnlink={unlinkEntityReference}
              />

              <div className="my-4 h-px bg-sw-border-subtle" />

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold">
                    {selectedBlock.title} 아래에 추가
                  </h3>
                  <span className="font-mono text-xs text-sw-text-ghost">
                    {selectedChildren.length}
                  </span>
                </div>

                <div className="rounded-md border border-sw-border-default bg-sw-bg-elevated p-3">
                  <div className="grid gap-2">
                    <PlanningDropdown
                      ariaLabel="추가할 구체화 카드 종류"
                      value={childKind}
                      onChange={(value) => setChildKind(value as ChildKind)}
                      options={childKindDropdownOptions}
                      compact
                    />
                    <input
                      value={childTitle}
                      onChange={(event) => setChildTitle(event.target.value)}
                      placeholder="카드 제목"
                      className="min-h-9 rounded-md border border-sw-border-default bg-sw-bg-surface px-2 text-sm outline-none"
                    />
                    <textarea
                      value={childSummary}
                      onChange={(event) => setChildSummary(event.target.value)}
                      placeholder="짧은 설명"
                      rows={2}
                      className="resize-none rounded-md border border-sw-border-default bg-sw-bg-surface px-2 py-2 text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={createChild}
                      disabled={isPending}
                      className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-sw-border-default bg-sw-bg-surface px-3 text-sm font-bold text-sw-text-primary hover:border-sw-accent-border hover:text-sw-accent disabled:opacity-60"
                    >
                      <Plus className="size-4" />
                      {pendingAction === "create" ? "추가 중" : "카드 추가"}
                    </button>
                  </div>
                </div>
              </section>

              {notice && <PlanningNoticeBox notice={notice} />}
              {isPending && (
                <p
                  aria-live="polite"
                  className="mt-2 text-xs font-semibold text-sw-text-muted"
                >
                  변경 사항을 반영하는 중입니다.
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-sw-border-default bg-sw-bg-elevated px-3 py-4 text-sm leading-6 text-sw-text-muted">
              구상 블록을 불러오지 못했습니다. 잠시 후 다시 열어보거나 프로젝트
              목록에서 다시 진입해주세요.
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
