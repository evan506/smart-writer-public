"use client";

import { createContext, useContext, useRef, useState } from "react";
import type { Chapter } from "@/types";

/* ── Data (triggers re-render) ── */
export interface WriteSidebarData {
  projectId: string;
  projectName: string;
  projectGenre: string | null;
  chapters: Chapter[];
  activeChapterId: string | null;
}

/* ── Callbacks (stored in ref, no re-render) ── */
export interface WriteSidebarCallbacks {
  onSelectChapter: (chapter: Chapter) => void;
  onChapterCreated: (chapter: Chapter) => void | Promise<void>;
  onChapterDeleted: (chapterId: string) => void;
}

interface WriteSidebarContextValue {
  data: WriteSidebarData | null;
  setData: (data: WriteSidebarData | null) => void;
  callbacksRef: React.RefObject<WriteSidebarCallbacks | null>;
}

const WriteSidebarContext = createContext<WriteSidebarContextValue>({
  data: null,
  setData: () => {},
  callbacksRef: { current: null },
});

export function WriteSidebarProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [data, setData] = useState<WriteSidebarData | null>(null);
  const callbacksRef = useRef<WriteSidebarCallbacks | null>(null);

  return (
    <WriteSidebarContext.Provider value={{ data, setData, callbacksRef }}>
      {children}
    </WriteSidebarContext.Provider>
  );
}

export function useWriteSidebar() {
  return useContext(WriteSidebarContext);
}
