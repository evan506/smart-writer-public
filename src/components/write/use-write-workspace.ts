"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { getEntityHighlightData } from "@/app/(dashboard)/projects/[id]/codex-actions";
import { createChapter } from "@/app/(dashboard)/projects/[id]/chapters-actions";
import type { EntityHighlightItem } from "@/components/editor/entity-highlight-plugin";
import type { TiptapEditorRef } from "@/components/tiptap-editor";
import { useAutosave } from "@/hooks/use-autosave";
import { textToDoc } from "@/lib/utils/editor-content";
import type { Chapter, InlineWarning } from "@/types";
import type { PlatformMode } from "./write-bottom-bar";
import { useWriteSidebar } from "./write-sidebar-context";
import type { RightPanelTab, WriteWorkspaceProps } from "./write-workspace-types";

export function useWriteWorkspace({
  projectId,
  projectName,
  projectGenre,
  initialChapters,
}: WriteWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeChapterId = searchParams.get("chapter");

  const [chapters, setChapters] = useState<Chapter[]>(initialChapters);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
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
  const [isCreatingFirstChapter, startCreatingFirstChapter] = useTransition();

  const editorRef = useRef<TiptapEditorRef>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isChapterSwitchingRef = useRef(false);

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

  const handleSelectChapter = useCallback(
    async (chapter: Chapter) => {
      if (chapter.id === activeChapterId) return;
      if (activeChapterId) {
        await saveDraftNow(title, content);
      }
      router.replace(`/projects/${projectId}/write?chapter=${chapter.id}`, {
        scroll: false,
      });
    },
    [activeChapterId, title, content, saveDraftNow, router, projectId]
  );

  const handleSelectChapterById = useCallback(
    async (chapterId: string) => {
      if (chapterId === activeChapterId) return;
      if (activeChapterId) {
        await saveDraftNow(title, content);
      }
      router.replace(`/projects/${projectId}/write?chapter=${chapterId}`, {
        scroll: false,
      });
    },
    [activeChapterId, title, content, saveDraftNow, router, projectId]
  );

  const handleChapterCreated = useCallback(
    async (chapter: Chapter) => {
      // Creating a chapter navigates away from the current one, so flush the
      // debounced draft first — exactly as handleSelectChapter does. Without this
      // the chapter switch resets the autosave timer and the last few seconds of
      // edits are dropped without ever reaching the DB.
      if (activeChapterId) {
        await saveDraftNow(title, content);
      }
      setChapters((prev) => [...prev, chapter]);
      toast.success("새 챕터가 생성되었습니다");
      router.replace(`/projects/${projectId}/write?chapter=${chapter.id}`, {
        scroll: false,
      });
    },
    [activeChapterId, title, content, saveDraftNow, router, projectId]
  );

  const handleCreateFirstChapter = useCallback(() => {
    startCreatingFirstChapter(async () => {
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("chapterNum", "1");
      formData.set("title", "");

      const result = await createChapter(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (!result.id) return;

      handleChapterCreated({
        id: result.id,
        project_id: projectId,
        chapter_num: 1,
        title: null,
        content: null,
        word_count: 0,
        summary: null,
        arc_summary: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    });
  }, [handleChapterCreated, projectId]);

  const handleChapterDeleted = useCallback(
    (chapterId: string) => {
      setChapters((prev) => prev.filter((chapter) => chapter.id !== chapterId));
      if (chapterId === activeChapterId) {
        const remaining = chapters.filter((chapter) => chapter.id !== chapterId);
        const next = remaining.sort((a, b) => a.chapter_num - b.chapter_num)[0];
        if (next) {
          router.replace(`/projects/${projectId}/write?chapter=${next.id}`, { scroll: false });
        } else {
          router.replace(`/projects/${projectId}/write`, { scroll: false });
        }
      }
    },
    [activeChapterId, chapters, router, projectId]
  );

  useEffect(() => {
    setData({ projectId, projectName, projectGenre, chapters, activeChapterId });
    return () => setData(null);
  }, [projectId, projectName, projectGenre, chapters, activeChapterId, setData]);

  useEffect(() => {
    callbacksRef.current = {
      onSelectChapter: handleSelectChapter,
      onChapterCreated: handleChapterCreated,
      onChapterDeleted: handleChapterDeleted,
    };
  });

  useEffect(() => {
    if (!activeChapter) {
      setTitle("");
      setContent("");
      setWarnings([]);
      return;
    }

    isChapterSwitchingRef.current = true;

    const chapterTitle = activeChapter.title ?? "";
    const chapterContent = activeChapter.content ?? "";

    setTitle(chapterTitle);
    setContent(chapterContent);
    setWarnings([]);
    initializeForChapter(chapterTitle, chapterContent);

    const editor = editorRef.current?.getEditor();
    if (editor) {
      editor.commands.setContent(textToDoc(chapterContent));
    }

    requestAnimationFrame(() => {
      isChapterSwitchingRef.current = false;
      titleInputRef.current?.focus();
    });
  }, [activeChapterId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aiAnalyzing) return;
    const timeout = window.setTimeout(() => setAiAnalyzing(false), 60_000);
    return () => window.clearTimeout(timeout);
  }, [aiAnalyzing, saveSignal]);

  useEffect(() => {
    if (!activeChapterId || isChapterSwitchingRef.current) return;
    scheduleSave(title, content);
  }, [title, content]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "s") {
        event.preventDefault();
        if (activeChapterId) {
          saveNow(title, content);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeChapterId, title, content, saveNow]);

  const handleContentUpdate = useCallback((text: string) => {
    if (isChapterSwitchingRef.current) return;
    setContent(text);
    setChapters((prev) =>
      prev.map((chapter) =>
        chapter.id === activeChapterId
          ? {
              ...chapter,
              content: text || null,
              word_count: text.replace(/\s/g, "").length,
            }
          : chapter
      )
    );
    setWarnings([]);
  }, [activeChapterId]);

  const handleEntityClick = useCallback((entityId: string) => {
    setSelectedEntityId(entityId);
    setRightPanelTab("codex");
    setRightPanelOpen(true);
  }, []);

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

  const handleSaveClick = useCallback(() => {
    if (activeChapterId) {
      saveNow(title, content);
    }
  }, [activeChapterId, title, content, saveNow]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    setChapters((prev) =>
      prev.map((chapter) =>
        chapter.id === activeChapterId ? { ...chapter, title: newTitle || null } : chapter
      )
    );
  }, [activeChapterId]);

  return {
    activeChapter,
    activeChapterId,
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
