// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWritingPosition } from "@/components/write/use-writing-position";

function editor(anchor = 12, head = 8) {
  return { state: { selection: { anchor, head }, doc: { content: { size: 101 } } },
    isDestroyed: false, commands: { setTextSelection: vi.fn(), focus: vi.fn() } };
}

function mount() {
  const current = editor();
  const draft = { current: { chapterId: "a" as string | null } };
  const scroll = document.createElement("div");
  scroll.scrollTop = 240;
  let active = current;
  const editorRef = { current: { getEditor: () => active as unknown as Editor, getContainer: () => null } };
  const hook = renderHook(() => useWritingPosition(draft, editorRef, { current: scroll }));
  act(() => hook.result.current.onEditorReady());
  return { ...hook, current, draft, scroll, setEditor: (next: ReturnType<typeof editor>) => { active = next; } };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("writing position memory", () => {
  it("restores backward selection, focus and scroll without changing text", () => {
    const { result, current, scroll } = mount();
    const point = result.current.capture()!;
    scroll.scrollTop = 0;
    act(() => { result.current.restore(point); vi.advanceTimersByTime(64); });
    expect(current.commands.setTextSelection).toHaveBeenCalledWith({ from: 12, to: 8 });
    expect(current.commands.focus).toHaveBeenCalledWith(undefined, { scrollIntoView: false });
    expect(scroll.scrollTop).toBe(240);
  });

  it("waits for the destination editor and ignores the previous editor during a chapter change", () => {
    const { result, current, draft, scroll, setEditor } = mount();
    act(() => { result.current.remember(); result.current.prepare("b"); });
    draft.current.chapterId = "b";
    expect(result.current.capture()).toBeNull();
    expect(current.commands.setTextSelection).not.toHaveBeenCalled();
    const next = editor();
    setEditor(next);
    act(() => { result.current.onEditorReady(); vi.advanceTimersByTime(64); });
    expect(next.commands.setTextSelection).toHaveBeenCalledWith({ from: 1, to: 1 });
    expect(scroll.scrollTop).toBe(0);
    act(() => { result.current.prepare("a"); });
    draft.current.chapterId = "a";
    setEditor(current);
    act(() => { result.current.onEditorReady(); vi.advanceTimersByTime(64); });
    expect(current.commands.setTextSelection).toHaveBeenCalledWith({ from: 12, to: 8 });
    expect(scroll.scrollTop).toBe(240);
  });

  it("clamps stale positions to the current document bounds", () => {
    const { result, current } = mount();
    act(() => { result.current.restore({ chapterId: "a", anchor: -10, head: 999, scrollTop: 0 }); });
    expect(current.commands.setTextSelection).toHaveBeenCalledWith({ from: 1, to: 100 });
  });

  it("waits for panel resizing to settle before restoring the viewport", () => {
    const { result, scroll } = mount();
    const point = result.current.capture()!;
    let width = 320;
    Object.defineProperty(scroll, "clientWidth", { get: () => width });
    scroll.scrollTop = 0;
    act(() => { result.current.restore(point); vi.advanceTimersByTime(16); });
    width = 450;
    act(() => { vi.advanceTimersByTime(16); });
    expect(scroll.scrollTop).toBe(0);
    width = 600;
    act(() => { vi.advanceTimersByTime(16); });
    expect(scroll.scrollTop).toBe(0);
    act(() => { vi.advanceTimersByTime(32); });
    expect(scroll.scrollTop).toBe(240);
  });

  it("cancels a queued scroll when another chapter is requested or the workspace unmounts", () => {
    const { result, scroll, unmount } = mount();
    const point = result.current.capture()!;
    scroll.scrollTop = 0;
    act(() => { result.current.restore(point); result.current.prepare("b"); vi.advanceTimersByTime(64); });
    expect(scroll.scrollTop).toBe(0);
    act(() => { result.current.restore(point); });
    unmount();
    act(() => { vi.advanceTimersByTime(64); });
    expect(scroll.scrollTop).toBe(0);
  });

  it("forgets a deleted chapter's saved and pending positions", () => {
    const { result, current } = mount();
    act(() => {
      result.current.remember(); result.current.prepare("a"); result.current.forget("a");
      result.current.onEditorReady();
    });
    expect(current.commands.setTextSelection).not.toHaveBeenCalled();
    act(() => { result.current.prepare("a"); result.current.onEditorReady(); });
    expect(current.commands.setTextSelection).toHaveBeenCalledWith({ from: 1, to: 1 });
  });
});
