// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave, type SaveResult } from "@/hooks/use-autosave";

const saveChapterMock = vi.hoisted(() => vi.fn());
const toastWarningMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(dashboard)/projects/[id]/chapters-actions", () => ({
  saveChapter: saveChapterMock,
}));

vi.mock("sonner", () => ({
  toast: { warning: toastWarningMock },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("waits for an older draft before sending the newer full save", async () => {
    const first = deferred<{ error: null; budgetBlocked?: boolean }>();
    const second = deferred<{ error: null; budgetBlocked?: boolean }>();
    saveChapterMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderHook(() =>
      useAutosave({ chapterId: "chapter-1", projectId: "project-1", debounceMs: 10 })
    );

    act(() => {
      result.current.scheduleSave("초안", "이전 내용");
      vi.advanceTimersByTime(10);
    });
    await flushPromises();
    expect(saveChapterMock).toHaveBeenCalledTimes(1);

    let fullSave!: Promise<SaveResult>;
    act(() => {
      fullSave = result.current.saveNow("완성", "최신 내용");
    });
    await flushPromises();
    expect(saveChapterMock).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve({ error: null }));
    await flushPromises();
    expect(saveChapterMock).toHaveBeenCalledTimes(2);
    expect(saveChapterMock.mock.calls[0]).toEqual([
      "chapter-1",
      "project-1",
      "초안",
      "이전 내용",
      { skipExtraction: true },
    ]);
    expect(saveChapterMock.mock.calls[1]).toEqual([
      "chapter-1",
      "project-1",
      "완성",
      "최신 내용",
      { skipExtraction: false },
    ]);

    await act(async () => second.resolve({ error: null }));
    await fullSave;
    expect(result.current.status).toBe("saved");
  });

  it("does not apply an old chapter response to the newly opened chapter", async () => {
    const oldSave = deferred<{ error: null }>();
    saveChapterMock.mockReturnValueOnce(oldSave.promise);

    const { result, rerender } = renderHook(
      ({ chapterId }) =>
        useAutosave({ chapterId, projectId: "project-1", debounceMs: 10 }),
      { initialProps: { chapterId: "chapter-1" as string | null } }
    );

    act(() => {
      result.current.scheduleSave("1화", "저장 중");
      vi.advanceTimersByTime(10);
    });
    await flushPromises();

    rerender({ chapterId: "chapter-2" });
    act(() => result.current.initializeForChapter("2화", "새 챕터"));
    await act(async () => oldSave.resolve({ error: null }));

    expect(result.current.status).toBe("idle");
  });

  it("warns on unload while a timer or network save is pending", async () => {
    const saving = deferred<{ error: null }>();
    saveChapterMock.mockReturnValueOnce(saving.promise);
    const { result } = renderHook(() =>
      useAutosave({ chapterId: "chapter-1", projectId: "project-1", debounceMs: 10 })
    );

    act(() => result.current.scheduleSave("제목", "내용"));
    const timerEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(timerEvent);
    expect(timerEvent.defaultPrevented).toBe(true);

    act(() => vi.advanceTimersByTime(10));
    await flushPromises();
    const networkEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(networkEvent);
    expect(networkEvent.defaultPrevented).toBe(true);

    await act(async () => saving.resolve({ error: null }));
    await flushPromises();
    const savedEvent = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(savedEvent);
    expect(savedEvent.defaultPrevented).toBe(false);
  });

  it("continues with a newer request after a network failure", async () => {
    const failed = deferred<{ error: null }>();
    saveChapterMock.mockReturnValueOnce(failed.promise).mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() =>
      useAutosave({ chapterId: "chapter-1", projectId: "project-1", debounceMs: 10 })
    );

    act(() => {
      result.current.scheduleSave("초안", "실패할 내용");
      vi.advanceTimersByTime(10);
      void result.current.saveDraftNow("초안", "다시 저장할 내용");
    });
    await flushPromises();
    await act(async () => failed.reject(new Error("network down")));
    await flushPromises();

    expect(saveChapterMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("runs extraction when a manual save has unchanged content", async () => {
    saveChapterMock.mockResolvedValue({ error: null, budgetBlocked: false });
    const onFullSaved = vi.fn();
    const { result } = renderHook(() =>
      useAutosave({ chapterId: "chapter-1", projectId: "project-1", onFullSaved })
    );

    act(() => result.current.initializeForChapter("제목", "같은 내용"));
    await act(async () => result.current.saveNow("제목", "같은 내용"));

    expect(saveChapterMock).toHaveBeenCalledWith(
      "chapter-1",
      "project-1",
      "제목",
      "같은 내용"
    );
    expect(onFullSaved).toHaveBeenCalledTimes(1);
  });
  it("marks the debounce dirty and ignores completion of an older revision", async () => {
    const first = deferred<{ error: null }>();
    saveChapterMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useAutosave({ chapterId: "chapter-1", projectId: "project-1", debounceMs: 10 }));
    act(() => result.current.initializeForChapter("제목", "처음"));
    act(() => result.current.scheduleSave("제목", "첫 수정"));
    expect(result.current.status).toBe("pending");
    expect(saveChapterMock).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(10));
    await flushPromises();
    expect(result.current.status).toBe("saving");
    act(() => result.current.scheduleSave("제목", "다음 수정"));
    await act(async () => first.resolve({ error: null }));
    expect(result.current.status).toBe("pending");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    act(() => vi.advanceTimersByTime(10));
    await flushPromises();
    expect(result.current.status).toBe("saved");
  });

  it.each(["resolved", "rejected"])("retains a %s failure for unload and allows retry", async (failure) => {
    if (failure === "resolved") saveChapterMock.mockResolvedValueOnce({ error: "저장 오류" });
    else saveChapterMock.mockRejectedValueOnce(new Error("network"));
    saveChapterMock.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useAutosave({ chapterId: "chapter-1", projectId: "project-1" }));
    let outcome!: SaveResult;
    await act(async () => { outcome = await result.current.saveDraftNow("제목", "보존할 내용"); });
    expect(outcome.success).toBe(false);
    expect(result.current.status).toBe("error");
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    await act(async () => { outcome = await result.current.saveDraftNow("제목", "보존할 내용"); });
    expect(outcome.success).toBe(true);
    expect(result.current.status).toBe("saved");
    const saved = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
  });

  it("starts offline, retains changes, and requires saving after reconnect", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    saveChapterMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAutosave({ chapterId: "chapter-1", projectId: "project-1", debounceMs: 10 }));
    expect(result.current.status).toBe("offline");
    act(() => {
      result.current.initializeForChapter("제목", "처음");
      result.current.scheduleSave("제목", "오프라인 수정");
      vi.advanceTimersByTime(10);
    });
    await flushPromises();
    expect(result.current.status).toBe("offline");
    expect(saveChapterMock).not.toHaveBeenCalled();
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current.status).toBe("pending");
    await act(async () => { await result.current.saveDraftNow("제목", "오프라인 수정"); });
    expect(result.current.status).toBe("saved");
    act(() => window.dispatchEvent(new Event("offline")));
    expect(result.current.status).toBe("offline");
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current.status).toBe("idle");
  });

  it("does not replace offline status when an in-flight request completes", async () => {
    const saving = deferred<{ error: null }>();
    saveChapterMock.mockReturnValueOnce(saving.promise);
    const { result } = renderHook(() => useAutosave({ chapterId: "chapter-1", projectId: "project-1" }));
    act(() => { void result.current.saveDraftNow("제목", "내용"); });
    await flushPromises();
    act(() => window.dispatchEvent(new Event("offline")));
    await act(async () => saving.resolve({ error: null }));
    expect(result.current.status).toBe("offline");
  });

  it("finishes an unchanged draft without sending a request or getting stuck saving", async () => {
    const { result } = renderHook(() => useAutosave({ chapterId: "chapter-1", projectId: "project-1" }));
    act(() => result.current.initializeForChapter("제목", "같은 내용"));
    await act(async () => {
      expect(await result.current.saveDraftNow("제목", "같은 내용")).toEqual({ success: true });
    });
    expect(result.current.status).toBe("saved");
    expect(saveChapterMock).not.toHaveBeenCalled();
  });

  it("pins the scheduled chapter before props change", async () => {
    saveChapterMock.mockResolvedValue({ error: null });
    const { result, rerender } = renderHook(({ chapterId }) => useAutosave({ chapterId, projectId: "project-1", debounceMs: 10 }),
      { initialProps: { chapterId: "chapter-1" } });
    act(() => result.current.scheduleSave("1화", "첫 회차 수정"));
    rerender({ chapterId: "chapter-2" });
    act(() => vi.advanceTimersByTime(10));
    await flushPromises();
    expect(saveChapterMock).toHaveBeenCalledWith("chapter-1", "project-1", "1화", "첫 회차 수정", { skipExtraction: true });
  });

  it("initializes and saves an explicit chapter before props commit", async () => {
    saveChapterMock.mockResolvedValue({ error: null });
    const { result } = renderHook(() => useAutosave({ chapterId: "chapter-1", projectId: "project-1" }));
    act(() => result.current.initializeForChapter("2화", "원문", "chapter-2"));
    await act(async () => { await result.current.saveDraftNow("2화", "수정", "chapter-2"); });
    expect(saveChapterMock).toHaveBeenCalledWith("chapter-2", "project-1", "2화", "수정", { skipExtraction: true });
    expect(result.current.status).toBe("saved");
  });

  it("keeps an active request saving when connectivity returns", async () => {
    const saving = deferred<{ error: null }>();
    saveChapterMock.mockReturnValueOnce(saving.promise);
    const { result } = renderHook(() => useAutosave({ chapterId: "chapter-1", projectId: "project-1" }));
    act(() => { void result.current.saveDraftNow("제목", "내용"); });
    await flushPromises();
    act(() => window.dispatchEvent(new Event("offline")));
    act(() => window.dispatchEvent(new Event("online")));
    expect(result.current.status).toBe("saving");
    await act(async () => saving.resolve({ error: null }));
    expect(result.current.status).toBe("saved");
  });

  it("does not treat a reinitialized failed draft as persisted", async () => {
    saveChapterMock.mockResolvedValueOnce({ error: "실패" }).mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useAutosave({ chapterId: "chapter-1", projectId: "project-1" }));
    act(() => result.current.initializeForChapter("제목", "저장된 원문"));
    await act(async () => { await result.current.saveDraftNow("제목", "실패한 수정"); });
    act(() => result.current.initializeForChapter("제목", "실패한 수정"));
    expect(result.current.status).toBe("pending");
    await act(async () => { await result.current.saveDraftNow("제목", "실패한 수정"); });
    expect(saveChapterMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe("saved");
  });

  it("allows an unchanged draft while offline without a network request", async () => {
    const { result } = renderHook(() => useAutosave({ chapterId: "chapter-1", projectId: "project-1" }));
    act(() => result.current.initializeForChapter("제목", "저장된 내용"));
    act(() => window.dispatchEvent(new Event("offline")));
    await act(async () => {
      expect(await result.current.saveDraftNow("제목", "저장된 내용")).toEqual({ success: true });
    });
    expect(result.current.status).toBe("offline");
    expect(saveChapterMock).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, "AI 사용 한도에 도달"],
    ["unavailable", "AI 사용 한도를 확인할 수 없어"],
  ])("shows a saved manuscript and AI warning for %s", async (budgetReason, message) => {
    saveChapterMock.mockResolvedValue({ error: null, budgetBlocked: true, budgetReason });
    const onSaved = vi.fn();
    const onFullSaved = vi.fn();
    const { result } = renderHook(() => useAutosave({
      chapterId: "chapter-1", projectId: "project-1", onSaved, onFullSaved,
    }));
    let response: unknown;
    await act(async () => { response = await result.current.saveNow("제목", "본문"); });
    expect(response).toEqual({ success: true });
    expect(result.current.status).toBe("saved");
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onFullSaved).not.toHaveBeenCalled();
    expect(toastWarningMock).toHaveBeenCalledWith(expect.stringContaining(message as string));
  });

});
