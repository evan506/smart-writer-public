"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { Editor } from "@tiptap/react";
import type { TiptapEditorRef } from "@/components/tiptap-editor";

export interface WritingPosition {
  chapterId: string;
  anchor: number;
  head: number;
  scrollTop: number;
}

// Position memory belongs to one open workspace; it never contains manuscript text.
export function useWritingPosition(
  draftRef: RefObject<{ chapterId: string | null }>,
  editorRef: RefObject<TiptapEditorRef | null>,
  containerRef: RefObject<HTMLDivElement | null>,
) {
  const positions = useRef(new Map<string, WritingPosition>());
  const pending = useRef<WritingPosition | null>(null);
  const ready = useRef<{ chapterId: string; editor: Editor } | null>(null);
  const frame = useRef<number | null>(null);
  const generation = useRef(0);

  const cancelRestore = useCallback(() => {
    generation.current += 1;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => () => { cancelRestore(); ready.current = null; }, [cancelRestore]);

  const capture = useCallback((): WritingPosition | null => {
    const chapterId = draftRef.current.chapterId;
    const editor = editorRef.current?.getEditor();
    if (!chapterId || !editor?.state?.selection || editor.isDestroyed) return null;
    if (ready.current?.chapterId !== chapterId || ready.current.editor !== editor) return null;
    return { chapterId, anchor: editor.state.selection.anchor, head: editor.state.selection.head,
      scrollTop: containerRef.current?.scrollTop ?? 0 };
  }, [draftRef, editorRef, containerRef]);

  const remember = useCallback(() => {
    const point = capture();
    if (point) positions.current.set(point.chapterId, point);
  }, [capture]);

  const applyPending = useCallback(() => {
    const point = pending.current;
    const binding = ready.current;
    if (!point || binding?.chapterId !== point.chapterId || draftRef.current.chapterId !== point.chapterId) return;
    const editor = binding.editor;
    if (editor.isDestroyed || editorRef.current?.getEditor() !== editor) return;
    pending.current = null;
    cancelRestore();
    const token = generation.current;
    const last = Math.max(1, editor.state.doc.content.size - 1);
    const clamp = (value: number) => Math.min(last, Math.max(1, value));
    editor.commands.setTextSelection({ from: clamp(point.anchor), to: clamp(point.head) });
    editor.commands.focus(undefined, { scrollIntoView: false });
    // Panel width transitions can reflow paragraphs after focus. Wait for two
    // stable layout frames before restoring scroll (bounded to half a second).
    let width = -1;
    let height = -1;
    let stableFrames = 0;
    let frames = 0;
    const restoreScroll = () => {
      frame.current = null;
      const container = containerRef.current;
      if (generation.current !== token || draftRef.current.chapterId !== point.chapterId ||
          editorRef.current?.getEditor() !== editor || editor.isDestroyed || !container) return;
      stableFrames = width === container.clientWidth && height === container.clientHeight ? stableFrames + 1 : 0;
      width = container.clientWidth;
      height = container.clientHeight;
      if (stableFrames >= 2 || ++frames >= 30) {
        container.scrollTop = point.scrollTop;
      } else {
        frame.current = requestAnimationFrame(restoreScroll);
      }
    };
    frame.current = requestAnimationFrame(restoreScroll);
  }, [draftRef, editorRef, containerRef, cancelRestore]);

  const prepare = useCallback((chapterId: string) => {
    cancelRestore();
    pending.current = positions.current.get(chapterId) ?? { chapterId, anchor: 1, head: 1, scrollTop: 0 };
  }, [cancelRestore]);

  const restore = useCallback((point: WritingPosition) => {
    cancelRestore();
    pending.current = point;
    applyPending();
  }, [cancelRestore, applyPending]);

  const onEditorReady = useCallback(() => {
    const editor = editorRef.current?.getEditor();
    const chapterId = draftRef.current.chapterId;
    if (!editor || !chapterId) return;
    ready.current = { chapterId, editor };
    applyPending();
  }, [draftRef, editorRef, applyPending]);

  const forget = useCallback((chapterId: string) => {
    positions.current.delete(chapterId);
    if (pending.current?.chapterId === chapterId) {
      cancelRestore();
      pending.current = null;
    }
  }, [cancelRestore]);

  return { capture, remember, prepare, restore, onEditorReady, forget };
}
