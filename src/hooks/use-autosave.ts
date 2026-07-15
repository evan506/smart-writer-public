"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { saveChapter } from "@/app/(dashboard)/projects/[id]/chapters-actions";

const BUDGET_BLOCKED_TOAST =
  "AI 사용 한도에 도달해 자동 분석이 일시 중지되었습니다. 원고는 정상적으로 저장되었습니다.";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "offline";

interface UseAutosaveOptions {
  chapterId: string | null;
  projectId: string;
  debounceMs?: number;
  onSaved?: () => void;
  onFullSaved?: () => void;
}

export function useAutosave({
  chapterId,
  projectId,
  debounceMs = 3000,
  onSaved,
  onFullSaved,
}: UseAutosaveOptions) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const lastSavedRef = useRef<{ title: string; content: string }>({
    title: "",
    content: "",
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<{ title: string; content: string } | null>(null);
  const chapterIdRef = useRef(chapterId);
  const onSavedRef = useRef(onSaved);
  const onFullSavedRef = useRef(onFullSaved);

  useEffect(() => {
    chapterIdRef.current = chapterId;
    onSavedRef.current = onSaved;
    onFullSavedRef.current = onFullSaved;
  }, [chapterId, onSaved, onFullSaved]);

  // Online/offline detection
  useEffect(() => {
    const handleOffline = () => setStatus("offline");
    const handleOnline = () =>
      setStatus((s) => (s === "offline" ? "idle" : s));
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const doSave = useCallback(
    async (title: string, content: string, skipExtraction: boolean) => {
      const id = chapterIdRef.current;
      if (!id) return;
      if (
        title === lastSavedRef.current.title &&
        content === lastSavedRef.current.content
      ) {
        if (!skipExtraction) {
          // Content unchanged but full save requested — still trigger extraction
          setStatus("saving");
          const result = await saveChapter(id, projectId, title || null, content || null);
          if (result.error) {
            setStatus("error");
          } else {
            setStatus("saved");
            onSavedRef.current?.();
            if (result.budgetBlocked) {
              // No extraction was scheduled — don't start suggestion polling.
              toast.warning(BUDGET_BLOCKED_TOAST);
            } else {
              onFullSavedRef.current?.();
            }
          }
        }
        return;
      }
      setStatus("saving");
      const result = await saveChapter(id, projectId, title || null, content || null, {
        skipExtraction,
      });
      if (result.error) {
        setStatus("error");
      } else {
        lastSavedRef.current = { title, content };
        setStatus("saved");
        onSavedRef.current?.();
        if (!skipExtraction) {
          if (result.budgetBlocked) {
            toast.warning(BUDGET_BLOCKED_TOAST);
          } else {
            onFullSavedRef.current?.();
          }
        }
      }
    },
    [projectId]
  );

  // Draft save: DB only, no extraction
  const scheduleSave = useCallback(
    (title: string, content: string) => {
      pendingRef.current = { title, content };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const pending = pendingRef.current;
        if (pending) {
          pendingRef.current = null;
          doSave(pending.title, pending.content, true);
        }
      }, debounceMs);
    },
    [doSave, debounceMs]
  );

  // Full save: DB + extraction
  const saveNow = useCallback(
    async (title: string, content: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = null;
      await doSave(title, content, false);
    },
    [doSave]
  );

  // Draft save immediately (for chapter switch — save DB, skip extraction)
  const saveDraftNow = useCallback(
    async (title: string, content: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = null;
      await doSave(title, content, true);
    },
    [doSave]
  );

  const initializeForChapter = useCallback(
    (title: string, content: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = null;
      lastSavedRef.current = { title, content };
      setStatus("idle");
    },
    []
  );

  // beforeunload warning
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pendingRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { status, scheduleSave, saveNow, saveDraftNow, initializeForChapter };
}
