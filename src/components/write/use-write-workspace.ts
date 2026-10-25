"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getEntityHighlightData } from "@/app/(dashboard)/projects/[id]/codex-actions";
import { useCreateChapter } from "@/hooks/use-create-chapter";
import type { EntityHighlightItem } from "@/components/editor/entity-highlight-plugin";
import type { TiptapEditorRef } from "@/components/tiptap-editor";
import { useAutosave } from "@/hooks/use-autosave";
import type { Chapter, InlineWarning } from "@/types";
import type { PlatformMode } from "./write-bottom-bar";
import { useWritingPosition, type WritingPosition } from "./use-writing-position";
import { useWriteSidebar } from "./write-sidebar-context";
import type { RightPanelTab, WriteWorkspaceProps } from "./write-workspace-types";

/**
 * Owns the editable draft and all chapter transitions. Entry points must use this
 * hook's callbacks: pin source -> lock -> flush -> activate last target, or keep
 * source on failure. URL changes are requests, never permission to replace a draft.
 * See docs/architecture/write-draft-lifecycle.md for the lifecycle/test contract.
 */
export function useWriteWorkspace({
  projectId,
  projectName,
  projectGenre,
  initialChapters,
}: WriteWorkspaceProps) {
  const searchParams = useSearchParams();
  const requestedChapterId = searchParams.get("chapter");
  const [initialChapter] = useState(() =>
    initialChapters.find((chapter) => chapter.id === requestedChapterId) ?? initialChapters[0] ?? null
  );
  const [activeChapterId, setActiveChapterId] = useState<string | null>(initialChapter?.id ?? null);

  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [title, setTitle] = useState(initialChapter?.title ?? "");
  const [content, setContent] = useState(initialChapter?.content ?? "");
  const [warnings, setWarnings] = useState<InlineWarning[]>([]);
  const [saveSignal, setSaveSignal] = useState(0);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("suggestions");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [platformMode, setPlatformMode] = useState<PlatformMode>("default");
  const [pendingSuggestionCount, setPendingSuggestionCount] = useState(0);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [entityHighlights, setEntityHighlights] = useState<EntityHighlightItem[]>([]);
  const [memoryRefreshSignal, setMemoryRefreshSignal] = useState(0);

  const editorRef = useRef<TiptapEditorRef>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isChapterSwitchingRef = useRef(false);
  const [isSwitchingChapter, setIsSwitchingChapter] = useState(false);
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const draftRef = useRef<{ chapterId: string | null; title: string; content: string }>({ chapterId: initialChapter?.id ?? null,
    title: initialChapter?.title ?? "", content: initialChapter?.content ?? "" });
  const chaptersRef = useRef(initialChapters);
  const requestedTargetRef = useRef<string | null>(null);
  const navigationPromiseRef = useRef<Promise<void> | null>(null);
  const deletingRef = useRef(false);
  const mountedRef = useRef(true);
  const position = useWritingPosition(draftRef, editorRef, containerRef);
  const { capture: capturePosition, remember: rememberPosition, prepare: preparePosition,
    restore: restorePosition, onEditorReady, forget: forgetPosition } = position;
  const [referenceOrigin, setReferenceOrigin] = useState<WritingPosition | null>(null);
  const referenceOriginRef = useRef<WritingPosition | null>(null);
  const returningRef = useRef(false);
  const [isReturningToWriting, setIsReturningToWriting] = useState(false);
  const clearReferenceOrigin = useCallback(() => {
    referenceOriginRef.current = null;
    setReferenceOrigin(null);
  }, []);
  const handleReferenceCapture = useCallback(() => {
    if (referenceOriginRef.current || isChapterSwitchingRef.current) return;
    const point = capturePosition();
    if (!point) return;
    referenceOriginRef.current = point;
  }, [capturePosition]);
  const handleReferenceStart = useCallback(() => {
    handleReferenceCapture();
    setReferenceOrigin(referenceOriginRef.current);
  }, [handleReferenceCapture]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const activeChapter = chapters.find((chapter) => chapter.id === activeChapterId) ?? null;

  const { status: saveStatus, scheduleSave, saveNow, saveDraftNow, initializeForChapter } =
    useAutosave({
      chapterId: activeChapterId,
      projectId,
      onFullSaved: () => {
        setAiAnalyzing(true);
        setSaveSignal((signal) => signal + 1);
      },
    });

  const { setData, callbacksRef } = useWriteSidebar();

  const syncUrl = useCallback((chapterId: string | null) => {
    if (!mountedRef.current) return;
    const url = new URL(window.location.href);
    if (chapterId) url.searchParams.set("chapter", chapterId);
    else url.searchParams.delete("chapter");
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
  }, []);

  const setLocked = useCallback((locked: boolean) => {
    if (!mountedRef.current) return;
    isChapterSwitchingRef.current = locked;
    editorRef.current?.getEditor()?.setEditable(!locked, false);
    if (titleInputRef.current) titleInputRef.current.disabled = locked;
    setIsSwitchingChapter(locked);
  }, []);

  const activateChapter = useCallback((chapter: Chapter | null) => {
    const next = { chapterId: chapter?.id ?? null, title: chapter?.title ?? "", content: chapter?.content ?? "" };
    if (next.chapterId) preparePosition(next.chapterId);
    draftRef.current = next;
    initializeForChapter(next.title, next.content, next.chapterId);
    // Publish cached chapter snapshots on navigation, not on every body keystroke.
    setChapters(chaptersRef.current);
    setActiveChapterId(next.chapterId);
    setTitle(next.title);
    setContent(next.content);
    setWarnings([]);
    syncUrl(next.chapterId);
  }, [initializeForChapter, syncUrl, preparePosition]);

  useEffect(() => {
    initializeForChapter(initialChapter?.title ?? "", initialChapter?.content ?? "", initialChapter?.id ?? null);
  }, [initialChapter, initializeForChapter]);

  const handleSelectChapterById = useCallback((chapterId: string): Promise<void> => {
    if (!mountedRef.current) return Promise.resolve();
    if (!chaptersRef.current.some((chapter) => chapter.id === chapterId)) {
      syncUrl(draftRef.current.chapterId);
      return Promise.resolve();
    }
    if (deletingRef.current) {
      syncUrl(draftRef.current.chapterId);
      return Promise.resolve();
    }
    requestedTargetRef.current = chapterId;
    if (navigationPromiseRef.current) {
      syncUrl(draftRef.current.chapterId);
      return navigationPromiseRef.current;
    }
    if (chapterId === draftRef.current.chapterId) {
      setNavigationError(null);
      syncUrl(chapterId);
      return Promise.resolve();
    }

    // Pin the complete source draft before yielding. Later clicks only replace the destination.
    const source = { ...draftRef.current };
    rememberPosition();
    setLocked(true);
    setNavigationError(null);
    syncUrl(source.chapterId);
    const operation = async () => {
      try {
        const result = source.chapterId
          ? await saveDraftNow(source.title, source.content, source.chapterId)
          : { success: true };
        if (!mountedRef.current) return;
        if (!result.success) {
          setNavigationError("원고를 저장하지 못해 회차를 이동하지 않았습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
          syncUrl(source.chapterId);
          return;
        }
        const next = chaptersRef.current.find((chapter) => chapter.id === requestedTargetRef.current);
        if (next) activateChapter(next);
      } finally {
        navigationPromiseRef.current = null;
        setLocked(false);
      }
    };
    // Start on the next microtask so even a no-chapter transition has a tracked promise.
    navigationPromiseRef.current = Promise.resolve().then(operation);
    return navigationPromiseRef.current;
  }, [activateChapter, saveDraftNow, setLocked, syncUrl, rememberPosition]);

  const handleReturnToWriting = useCallback(async () => {
    const origin = referenceOriginRef.current;
    if (!origin || returningRef.current || isChapterSwitchingRef.current || deletingRef.current) return false;
    if (!chaptersRef.current.some((chapter) => chapter.id === origin.chapterId)) {
      clearReferenceOrigin();
      return false;
    }
    returningRef.current = true;
    setIsReturningToWriting(true);
    try {
      await handleSelectChapterById(origin.chapterId);
      if (!mountedRef.current || draftRef.current.chapterId !== origin.chapterId || isChapterSwitchingRef.current) return false;
      restorePosition(origin);
      clearReferenceOrigin();
      return true;
    } finally {
      returningRef.current = false;
      if (mountedRef.current) setIsReturningToWriting(false);
    }
  }, [handleSelectChapterById, restorePosition, clearReferenceOrigin]);

  const handleCloseReferencePanel = useCallback(() => {
    setRightPanelOpen(false);
    const origin = referenceOriginRef.current;
    if (origin?.chapterId === draftRef.current.chapterId && !isChapterSwitchingRef.current) {
      restorePosition(origin);
      clearReferenceOrigin();
    }
  }, [restorePosition, clearReferenceOrigin]);

  const handleRetryNavigation = useCallback(() => {
    if (requestedTargetRef.current) void handleSelectChapterById(requestedTargetRef.current);
  }, [handleSelectChapterById]);

  const handleSelectChapter = useCallback((chapter: Chapter) =>
    handleSelectChapterById(chapter.id), [handleSelectChapterById]);

  const handleChapterCreated = useCallback(async (chapter: Chapter) => {
    if (!mountedRef.current) return;
    if (!chaptersRef.current.some((existing) => existing.id === chapter.id)) {
      chaptersRef.current = [...chaptersRef.current, chapter];
      setChapters(chaptersRef.current);
    }
    toast.success("새 챕터가 생성되었습니다");
    await handleSelectChapterById(chapter.id);
  }, [handleSelectChapterById]);

  const { create: handleCreateFirstChapter, isCreating: isCreatingFirstChapter } =
    useCreateChapter(projectId, handleChapterCreated);

  const handleBeforeChapterDelete = useCallback(async () => {
    if (isChapterSwitchingRef.current) return false;
    deletingRef.current = true;
    setLocked(true);
    const source = { ...draftRef.current };
    const result = source.chapterId
      ? await saveDraftNow(source.title, source.content, source.chapterId)
      : { success: true };
    if (!result.success) {
      deletingRef.current = false;
      setLocked(false);
      toast.error("원고를 저장하지 못해 삭제를 중단했습니다. 저장 후 다시 시도해 주세요.");
    }
    return result.success;
  }, [saveDraftNow, setLocked]);

  const handleChapterDeleteFinished = useCallback(() => {
    deletingRef.current = false;
    setLocked(false);
  }, [setLocked]);

  const handleChapterDeleted = useCallback((chapterId: string) => {
    forgetPosition(chapterId);
    if (referenceOriginRef.current?.chapterId === chapterId) clearReferenceOrigin();
    chaptersRef.current = chaptersRef.current.filter((chapter) => chapter.id !== chapterId);
    setChapters(chaptersRef.current);
    if (chapterId === draftRef.current.chapterId) {
      activateChapter([...chaptersRef.current].sort((a, b) => a.chapter_num - b.chapter_num)[0] ?? null);
    }
    setNavigationError(null);
  }, [activateChapter, forgetPosition, clearReferenceOrigin]);

  useEffect(() => {
    setData({ projectId, projectName, projectGenre, chapters, activeChapterId, isCreating: isCreatingFirstChapter });
    return () => setData(null);
  }, [projectId, projectName, projectGenre, chapters, activeChapterId, isCreatingFirstChapter, setData]);

  useEffect(() => {
    callbacksRef.current = {
      onSelectChapter: handleSelectChapter,
      onCreateChapter: handleCreateFirstChapter,
      onChapterDeleted: handleChapterDeleted,
      onBeforeChapterDelete: handleBeforeChapterDelete,
      onChapterDeleteFinished: handleChapterDeleteFinished,
    };
  }, [callbacksRef, handleCreateFirstChapter, handleChapterDeleted, handleSelectChapter,
    handleBeforeChapterDelete, handleChapterDeleteFinished]);

  const handleUrlChange = useEffectEvent(() => {
    if (requestedChapterId === draftRef.current.chapterId) return;
    if (requestedChapterId) void handleSelectChapterById(requestedChapterId);
    else syncUrl(draftRef.current.chapterId);
  });
  useEffect(() => { handleUrlChange(); }, [requestedChapterId]);

  useEffect(() => {
    if (!aiAnalyzing) return;
    const timeout = window.setTimeout(() => setAiAnalyzing(false), 60_000);
    return () => window.clearTimeout(timeout);
  }, [aiAnalyzing, saveSignal]);

  const handleSaveClick = useCallback(() => {
    if (isChapterSwitchingRef.current) return;
    const draft = draftRef.current;
    if (draft.chapterId) void saveNow(draft.title, draft.content, draft.chapterId);
  }, [saveNow]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        handleSaveClick();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSaveClick]);

  const updateDraft = useCallback((change: { title?: string; content?: string }) => {
    if (isChapterSwitchingRef.current || !draftRef.current.chapterId) return;
    const draft = { ...draftRef.current, ...change };
    draftRef.current = draft;
    if (referenceOriginRef.current?.chapterId === draft.chapterId) clearReferenceOrigin();
    setTitle(draft.title);
    setContent(draft.content);
    chaptersRef.current = chaptersRef.current.map((chapter) => chapter.id === draft.chapterId
      ? { ...chapter, title: draft.title || null, content: draft.content || null,
          word_count: draft.content.replace(/\s/g, "").length }
      : chapter);
    if (change.title !== undefined) setChapters(chaptersRef.current);
    scheduleSave(draft.title, draft.content);
    setWarnings((current) => current.length ? [] : current);
  }, [scheduleSave, clearReferenceOrigin]);

  const handleContentUpdate = useCallback((text: string) => updateDraft({ content: text }), [updateDraft]);
  const handleTitleChange = useCallback((newTitle: string) => updateDraft({ title: newTitle }), [updateDraft]);

  const handleEntityClick = useCallback((entityId: string) => {
    handleReferenceStart();
    setSelectedEntityId(entityId);
    setRightPanelTab("codex");
    setRightPanelOpen(true);
  }, [handleReferenceStart]);

  const refreshEntityHighlights = useCallback(async () => {
    const result = await getEntityHighlightData(projectId);
    if (!result.error) {
      setEntityHighlights(result.entities);
    }
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    async function fetchHighlights() {
      const result = await getEntityHighlightData(projectId);
      if (!cancelled && !result.error) {
        setEntityHighlights(result.entities);
      }
    }
    fetchHighlights();
    return () => {
      cancelled = true;
    };
  }, [projectId, saveSignal]);

  const handleMemoryChange = useCallback(() => {
    setMemoryRefreshSignal((signal) => signal + 1);
    refreshEntityHighlights();
  }, [refreshEntityHighlights]);

  return {
    activeChapter,
    activeChapterId,
    referenceChapter: chapters.find((chapter) => chapter.id === referenceOrigin?.chapterId) ?? null,
    handleReferenceStart,
    handleReferenceCapture,
    handleReturnToWriting,
    handleCloseReferencePanel,
    onEditorReady,
    isReturningToWriting,
    aiAnalyzing,
    codexRefreshSignal: saveSignal + memoryRefreshSignal,
    content,
    containerRef,
    editorRef,
    entityHighlights,
    handleContentUpdate,
    handleCreateFirstChapter,
    handleEntityClick,
    handleMemoryChange,
    handleSaveClick,
    handleSelectChapterById,
    handleTitleChange,
    isCreatingFirstChapter,
    isSwitchingChapter,
    navigationError,
    handleRetryNavigation,
    pendingSuggestionCount,
    platformMode,
    projectId,
    rightPanelOpen,
    rightPanelTab,
    saveSignal,
    saveStatus,
    selectedEntityId,
    setAiAnalyzing,
    setPendingSuggestionCount,
    setPlatformMode,
    setRightPanelOpen,
    setRightPanelTab,
    setSelectedEntityId,
    title,
    titleInputRef,
    warnings,
  };
}
