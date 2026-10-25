// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWriteWorkspace } from "@/components/write/use-write-workspace";
import type { WriteSidebarCallbacks } from "@/components/write/write-sidebar-context";
import type { Chapter } from "@/types";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  created: null as null | ((chapter: Chapter) => Promise<void>),
  callbacks: { current: null as WriteSidebarCallbacks | null },
  setData: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("@/app/(dashboard)/projects/[id]/chapters-actions", () => ({ saveChapter: mocks.save }));
vi.mock("@/app/(dashboard)/projects/[id]/codex-actions", () => ({
  getEntityHighlightData: async () => ({ entities: [] }),
}));
vi.mock("@/hooks/use-create-chapter", () => ({
  useCreateChapter: (_id: string, callback: (chapter: Chapter) => Promise<void>) => {
    mocks.created = callback;
    return { create: vi.fn(), isCreating: false };
  },
}));
vi.mock("@/components/write/write-sidebar-context", () => ({
  useWriteSidebar: () => ({ setData: mocks.setData, callbacksRef: mocks.callbacks }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

function chapter(id: string, num: number): Chapter {
  return { id, chapter_num: num, project_id: "project", title: `${id} 제목`, content: `${id} 원문` } as Chapter;
}
const initialChapters = [chapter("a", 1), chapter("b", 2), chapter("c", 3)];
function mount() {
  return renderHook(() => useWriteWorkspace({ projectId: "project", projectName: "작품", projectGenre: null, initialChapters }));
}
function deferred() {
  let resolve!: (result: { error: string | null }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ error: string | null }>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function settle() { await act(async () => { await Promise.resolve(); }); }
const urlChapter = () => new URLSearchParams(window.location.search).get("chapter");

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({ error: null });
  window.history.replaceState(null, "", "/projects/project/write?chapter=a");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("workspace chapter navigation with real autosave", () => {
  function attachEditor(result: ReturnType<typeof mount>["result"]) {
    const commands = { setTextSelection: vi.fn(), focus: vi.fn() };
    const editor = { state: { selection: { anchor: 9, head: 5 }, doc: { content: { size: 100 } } },
      commands, isDestroyed: false, setEditable: vi.fn() } as unknown as Editor;
    result.current.editorRef.current = { getEditor: () => editor, getContainer: () => null };
    act(() => { result.current.onEditorReady(); });
    return commands;
  }

  it("restores the original selection on panel close despite nested reference lookups", () => {
    const { result } = mount();
    const commands = attachEditor(result);
    act(() => { result.current.handleReferenceStart(); result.current.handleReferenceStart(); });
    expect(result.current.referenceChapter?.id).toBe("a");
    act(() => { result.current.handleCloseReferencePanel(); });
    expect(commands.setTextSelection).toHaveBeenCalledWith({ from: 9, to: 5 });
    expect(result.current.referenceChapter).toBeNull();
  });

  it("retains the return target and reference draft when save fails, then returns on retry", async () => {
    const { result } = mount();
    attachEditor(result);
    act(() => { result.current.handleReferenceStart(); });
    await act(async () => { await result.current.handleSelectChapterById("b"); });
    const commands = attachEditor(result);
    commands.setTextSelection.mockClear();
    act(() => { result.current.handleContentUpdate("참조 회차에 작성한 메모"); });
    mocks.save.mockResolvedValueOnce({ error: "저장 실패" });
    await act(async () => { expect(await result.current.handleReturnToWriting()).toBe(false); });
    expect(result.current.activeChapterId).toBe("b");
    expect(result.current.referenceChapter?.id).toBe("a");
    expect(result.current.content).toBe("참조 회차에 작성한 메모");
    expect(commands.setTextSelection).not.toHaveBeenCalled();
    await act(async () => { expect(await result.current.handleReturnToWriting()).toBe(true); });
    expect(result.current.activeChapterId).toBe("a");
    expect(result.current.referenceChapter).toBeNull();
    const restored = attachEditor(result);
    expect(restored.setTextSelection).toHaveBeenCalledWith({ from: 9, to: 5 });
    expect(mocks.save).toHaveBeenLastCalledWith("b", "project", "b 제목", "참조 회차에 작성한 메모", { skipExtraction: true });
  });

  it("clears the return target when its chapter is deleted", async () => {
    const { result } = mount();
    attachEditor(result);
    act(() => { result.current.handleReferenceStart(); });
    await act(async () => { await result.current.handleSelectChapterById("b"); });
    act(() => { mocks.callbacks.current!.onChapterDeleted("a"); });
    expect(result.current.referenceChapter).toBeNull();
    await act(async () => { expect(await result.current.handleReturnToWriting()).toBe(false); });
    expect(result.current.activeChapterId).toBe("b");
  });

  it("keeps body typing out of sidebar updates while saving the live draft", async () => {
    const { result } = mount();
    await settle();
    mocks.setData.mockClear();
    act(() => { result.current.handleContentUpdate("입력한 최신 원고"); });
    expect(result.current.content).toBe("입력한 최신 원고");
    expect(mocks.setData).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(mocks.save).toHaveBeenCalledWith("a", "project", "a 제목", "입력한 최신 원고", { skipExtraction: true });
    act(() => { result.current.handleTitleChange("바뀐 제목"); });
    expect(mocks.setData.mock.calls.at(-1)?.[0].chapters[0].title).toBe("바뀐 제목");
    await act(async () => { await result.current.handleSelectChapterById("b"); });
    await act(async () => { await result.current.handleSelectChapterById("a"); });
    expect(result.current.content).toBe("입력한 최신 원고");
  });

  it("starts with the selected title and body without saving initial content", async () => {
    const { result } = mount();
    await settle();
    expect(result.current.title).toBe("a 제목");
    expect(result.current.content).toBe("a 원문");
    act(() => { vi.advanceTimersByTime(4000); });
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("pins same-tick edits, locks input and coalesces rapid clicks while a slow save runs", async () => {
    const save = deferred();
    mocks.save.mockReturnValueOnce(save.promise);
    const { result } = mount();
    const setEditable = vi.fn();
    result.current.editorRef.current = { getEditor: () => ({ setEditable }) as unknown as Editor, getContainer: () => null };
    const titleInput = document.createElement("input");
    result.current.titleInputRef.current = titleInput;
    let first!: Promise<void>;
    act(() => {
      result.current.handleTitleChange("마지막 제목");
      result.current.handleContentUpdate("클릭 직전 한글 원고");
      first = result.current.handleSelectChapterById("b");
      void result.current.handleSelectChapterById("c");
      result.current.handleContentUpdate("잠금 중 입력");
      result.current.handleTitleChange("잠금 중 제목");
      result.current.handleSaveClick();
    });
    await settle();
    expect(result.current.activeChapterId).toBe("a");
    expect(result.current.content).toBe("클릭 직전 한글 원고");
    expect(result.current.isSwitchingChapter).toBe(true);
    expect(titleInput.disabled).toBe(true);
    expect(setEditable).toHaveBeenCalledWith(false, false);
    expect(urlChapter()).toBe("a");
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("a", "project", "마지막 제목", "클릭 직전 한글 원고", { skipExtraction: true });
    await act(async () => { save.resolve({ error: null }); await first; });
    expect(result.current.activeChapterId).toBe("c");
    expect(result.current.title).toBe("c 제목");
    expect(result.current.content).toBe("c 원문");
    expect(urlChapter()).toBe("c");
    expect(titleInput.disabled).toBe(false);
    await act(async () => { await result.current.handleSelectChapterById("a"); });
    expect(result.current.title).toBe("마지막 제목");
    expect(result.current.content).toBe("클릭 직전 한글 원고");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it.each(["result", "rejection"])("preserves draft and URL on %s failure and retries the latest text", async (failure) => {
    const save = deferred();
    mocks.save.mockReturnValueOnce(save.promise);
    const { result } = mount();
    let navigation!: Promise<void>;
    act(() => {
      result.current.handleContentUpdate("보존할 원고");
      navigation = result.current.handleSelectChapterById("b");
    });
    await settle();
    await act(async () => {
      if (failure === "result") save.resolve({ error: "서버 실패" });
      else save.reject(new Error("network"));
      await navigation;
    });
    expect(result.current.activeChapterId).toBe("a");
    expect(result.current.content).toBe("보존할 원고");
    expect(result.current.navigationError).toContain("이동하지 않았습니다");
    expect(result.current.isSwitchingChapter).toBe(false);
    expect(urlChapter()).toBe("a");
    act(() => {
      result.current.handleContentUpdate("실패 후 보완한 원고");
      result.current.handleRetryNavigation();
    });
    await settle();
    expect(mocks.save).toHaveBeenLastCalledWith("a", "project", "a 제목", "실패 후 보완한 원고", { skipExtraction: true });
    expect(result.current.activeChapterId).toBe("b");
    expect(urlChapter()).toBe("b");
    expect(result.current.navigationError).toBeNull();
  });

  it("rolls an external URL change back until save succeeds", async () => {
    const save = deferred();
    mocks.save.mockReturnValueOnce(save.promise);
    const { result, rerender } = mount();
    act(() => { result.current.handleContentUpdate("외부 이동 전 원고"); });
    window.history.pushState(null, "", "?chapter=b");
    rerender();
    await settle();
    expect(result.current.activeChapterId).toBe("a");
    expect(urlChapter()).toBe("a");
    await act(async () => { save.resolve({ error: null }); });
    expect(result.current.activeChapterId).toBe("b");
    expect(urlChapter()).toBe("b");
  });

  it("rolls repeated external query changes back and opens only the latest target", async () => {
    const save = deferred();
    mocks.save.mockReturnValueOnce(save.promise);
    const { result, rerender } = mount();
    act(() => { result.current.handleContentUpdate("연속 외부 이동 원고"); });
    window.history.pushState(null, "", "?chapter=b");
    rerender();
    await settle();
    window.history.pushState(null, "", "?chapter=c");
    rerender();
    expect(urlChapter()).toBe("a");
    expect(result.current.activeChapterId).toBe("a");
    await act(async () => { save.resolve({ error: null }); });
    expect(result.current.activeChapterId).toBe("c");
    expect(urlChapter()).toBe("c");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("keeps external navigation failure on the source and rejects unknown IDs", async () => {
    mocks.save.mockResolvedValueOnce({ error: "실패" });
    const { result, rerender } = mount();
    act(() => { result.current.handleContentUpdate("원고 유지"); });
    window.history.pushState(null, "", "?chapter=b");
    rerender();
    await settle();
    expect(result.current.activeChapterId).toBe("a");
    expect(urlChapter()).toBe("a");
    expect(result.current.content).toBe("원고 유지");
    window.history.pushState(null, "", "?chapter=unknown");
    rerender();
    expect(urlChapter()).toBe("a");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("reads the live draft when a slow chapter creation callback eventually arrives", async () => {
    const { result } = mount();
    const staleCreated = mocks.created!;
    act(() => { result.current.handleContentUpdate("생성 응답 대기 중에도 쓴 원고"); });
    await act(async () => { await staleCreated(chapter("d", 4)); });
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("a", "project", "a 제목", "생성 응답 대기 중에도 쓴 원고", { skipExtraction: true });
    expect(result.current.activeChapterId).toBe("d");
    expect(result.current.content).toBe("d 원문");
    await act(async () => { await staleCreated(chapter("d", 4)); });
    expect(mocks.setData.mock.calls.at(-1)?.[0].chapters.filter((row: Chapter) => row.id === "d")).toHaveLength(1);
  });

  it("saves an edit immediately after switching to the correct chapter", async () => {
    const { result } = mount();
    await act(async () => { await result.current.handleSelectChapterById("b"); });
    act(() => {
      result.current.handleContentUpdate("새 회차 첫 입력");
      vi.advanceTimersByTime(3000);
    });
    await settle();
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("b", "project", "b 제목", "새 회차 첫 입력", { skipExtraction: true });
  });

  it("flushes before deletion, blocks navigation and never saves the deleted chapter again", async () => {
    const save = deferred();
    mocks.save.mockReturnValueOnce(save.promise);
    const { result } = mount();
    act(() => { result.current.handleContentUpdate("삭제 전 저장"); });
    let ready!: Promise<boolean>;
    act(() => { ready = mocks.callbacks.current!.onBeforeChapterDelete(); });
    await settle();
    await act(async () => { await result.current.handleSelectChapterById("b"); });
    expect(result.current.activeChapterId).toBe("a");
    await act(async () => { save.resolve({ error: null }); expect(await ready).toBe(true); });
    act(() => {
      mocks.callbacks.current!.onChapterDeleted("a");
      mocks.callbacks.current!.onChapterDeleteFinished();
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.activeChapterId).toBe("b");
    expect(result.current.content).toBe("b 원문");
    expect(urlChapter()).toBe("b");
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("does not change another page URL when a pending navigation finishes after unmount", async () => {
    const save = deferred();
    mocks.save.mockReturnValueOnce(save.promise);
    const { result, unmount } = mount();
    let navigation!: Promise<void>;
    act(() => {
      result.current.handleContentUpdate("다른 화면으로 나가기 전 원고");
      navigation = result.current.handleSelectChapterById("b");
    });
    await settle();
    unmount();
    window.history.replaceState(null, "", "/projects");
    await act(async () => { save.resolve({ error: null }); await navigation; });
    expect(window.location.pathname).toBe("/projects");
    expect(window.location.search).toBe("");
  });

});
