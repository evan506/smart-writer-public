"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { saveChapter } from "@/app/(dashboard)/projects/[id]/chapters-actions";

const BUDGET_BLOCKED_TOAST =
  "AI 사용 한도에 도달해 자동 분석이 일시 중지되었습니다. 원고는 정상적으로 저장되었습니다.";

const BUDGET_UNAVAILABLE_TOAST =
  "AI 사용 한도를 확인할 수 없어 자동 분석을 잠시 중지했습니다. 원고는 정상적으로 저장되었습니다.";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "offline";
export type SaveResult = { success: true } | { success: false; error: string };

type SaveRequest = {
  chapterId: string;
  title: string;
  content: string;
  skipExtraction: boolean;
  sequence: number;
};

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
  const lastSavedByChapterRef = useRef(new Map<string, { title: string; content: string }>());
  // Keep failed and offline drafts dirty until their exact revision is saved.
  const unsavedByChapterRef = useRef(new Map<string, SaveRequest>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SaveRequest | null>(null);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const outstandingRequestsRef = useRef(new Set<number>());
  const sequenceRef = useRef(0);
  const latestSequenceRef = useRef(0);
  const mountedRef = useRef(true);
  const onlineRef = useRef(true);
  const chapterIdRef = useRef(chapterId);
  const onSavedRef = useRef(onSaved);
  const onFullSavedRef = useRef(onFullSaved);

  useEffect(() => {
    chapterIdRef.current = chapterId;
    onSavedRef.current = onSaved;
    onFullSavedRef.current = onFullSaved;
  }, [chapterId, onSaved, onFullSaved]);

  useEffect(() => {
    onlineRef.current = navigator.onLine;
    if (!onlineRef.current) setStatus("offline");
    const handleOffline = () => {
      onlineRef.current = false;
      setStatus("offline");
    };
    const handleOnline = () => {
      onlineRef.current = true;
      const id = chapterIdRef.current;
      const draft = id ? unsavedByChapterRef.current.get(id) : undefined;
      setStatus(draft ? outstandingRequestsRef.current.has(draft.sequence) ? "saving" : "pending" : "idle");
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const updateRequestStatus = useCallback((request: SaveRequest, next: SaveStatus) => {
    if (mountedRef.current && chapterIdRef.current === request.chapterId &&
        latestSequenceRef.current === request.sequence) {
      setStatus(onlineRef.current ? next : "offline");
    }
  }, []);

  const performSave = useCallback(async (request: SaveRequest): Promise<SaveResult> => {
    const lastSaved = lastSavedByChapterRef.current.get(request.chapterId);
    const unchanged = lastSaved?.title === request.title && lastSaved.content === request.content;
    if (!onlineRef.current && !(unchanged && request.skipExtraction)) {
      updateRequestStatus(request, "offline");
      return { success: false, error: "오프라인입니다. 연결 후 다시 저장해 주세요." };
    }
    try {
      // A manual save still requests extraction when the text is unchanged.
      const result = unchanged && request.skipExtraction
        ? { error: null }
        : unchanged
          ? await saveChapter(request.chapterId, projectId, request.title || null, request.content || null)
          : await saveChapter(request.chapterId, projectId, request.title || null, request.content || null,
              { skipExtraction: request.skipExtraction });
      if (result.error) {
        updateRequestStatus(request, "error");
        return { success: false, error: result.error };
      }
      lastSavedByChapterRef.current.set(request.chapterId, { title: request.title, content: request.content });
      if (unsavedByChapterRef.current.get(request.chapterId)?.sequence === request.sequence) {
        unsavedByChapterRef.current.delete(request.chapterId);
      }
      updateRequestStatus(request, "saved");
      if (mountedRef.current && chapterIdRef.current === request.chapterId && !(unchanged && request.skipExtraction)) {
        onSavedRef.current?.();
        if (!request.skipExtraction) {
          if ("budgetBlocked" in result && result.budgetBlocked) {
            toast.warning("budgetReason" in result && result.budgetReason === "unavailable"
              ? BUDGET_UNAVAILABLE_TOAST : BUDGET_BLOCKED_TOAST);
          } else onFullSavedRef.current?.();
        }
      }
      return { success: true };
    } catch {
      updateRequestStatus(request, "error");
      return { success: false, error: "저장하지 못했습니다. 다시 시도해 주세요." };
    }
  }, [projectId, updateRequestStatus]);

  const makeRequest = useCallback((title: string, content: string, skipExtraction: boolean,
    targetChapterId = chapterIdRef.current): SaveRequest | null => {
    if (!targetChapterId) return null;
    const request = { chapterId: targetChapterId, title, content, skipExtraction, sequence: ++sequenceRef.current };
    latestSequenceRef.current = request.sequence;
    unsavedByChapterRef.current.set(targetChapterId, request);
    return request;
  }, []);

  const enqueueSave = useCallback((request: SaveRequest): Promise<SaveResult> => {
    outstandingRequestsRef.current.add(request.sequence);
    updateRequestStatus(request, "saving");
    const queued = saveChainRef.current.then(() => performSave(request));
    saveChainRef.current = queued.finally(() => { outstandingRequestsRef.current.delete(request.sequence); });
    return queued;
  }, [performSave, updateRequestStatus]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    pendingRef.current = null;
  }, []);

  const scheduleSave = useCallback((title: string, content: string) => {
    const request = makeRequest(title, content, true);
    if (!request) return;
    clearTimer();
    pendingRef.current = request;
    updateRequestStatus(request, "pending");
    timerRef.current = setTimeout(() => {
      const pending = pendingRef.current;
      clearTimer();
      if (pending) void enqueueSave(pending);
    }, debounceMs);
  }, [makeRequest, clearTimer, updateRequestStatus, enqueueSave, debounceMs]);

  const saveImmediately = useCallback((title: string, content: string, skipExtraction: boolean,
    targetChapterId = chapterIdRef.current): Promise<SaveResult> => {
    const request = makeRequest(title, content, skipExtraction, targetChapterId);
    if (!request) return Promise.resolve({ success: false, error: "저장할 회차가 없습니다." });
    clearTimer();
    return enqueueSave(request);
  }, [makeRequest, clearTimer, enqueueSave]);

  const saveNow = useCallback((title: string, content: string, targetChapterId?: string) =>
    saveImmediately(title, content, false, targetChapterId), [saveImmediately]);
  const saveDraftNow = useCallback((title: string, content: string, targetChapterId?: string) =>
    saveImmediately(title, content, true, targetChapterId), [saveImmediately]);

  const initializeForChapter = useCallback((title: string, content: string,
    targetChapterId = chapterIdRef.current) => {
    clearTimer();
    // Explicit target supports initialization before React commits a chapter selection.
    chapterIdRef.current = targetChapterId;
    const draft = targetChapterId ? unsavedByChapterRef.current.get(targetChapterId) : undefined;
    latestSequenceRef.current = draft?.sequence ?? ++sequenceRef.current;
    if (targetChapterId && !draft) {
      lastSavedByChapterRef.current.set(targetChapterId, { title, content });
    }
    const draftStatus = draft && outstandingRequestsRef.current.has(draft.sequence) ? "saving" : "pending";
    setStatus(!onlineRef.current ? "offline" : draft ? draftStatus : "idle");
  }, [clearTimer]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (unsavedByChapterRef.current.size > 0 || outstandingRequestsRef.current.size > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { status, scheduleSave, saveNow, saveDraftNow, initializeForChapter };
}
