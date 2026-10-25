"use client";

import { useSidebar } from "@/components/ui/sidebar";
import { useState } from "react";
import { toast } from "sonner";
import {
  deleteChapter,
} from "@/app/(dashboard)/projects/[id]/chapters-actions";
import { useWriteSidebar } from "@/components/write/write-sidebar-context";
import type { Chapter } from "@/types";
import { ChapterDeleteDialog } from "./chapter-delete-dialog";
import { CollapsedChapterList, ExpandedChapterList } from "./chapter-list-parts";

export function WriteChapterSidebar({ expanded }: { expanded: boolean }) {
  const { setOpenMobile } = useSidebar();
  const { data, callbacksRef } = useWriteSidebar();
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!data) return null;

  const { projectId, projectName, projectGenre, chapters, activeChapterId, isCreating } = data;
  const sorted = [...chapters].sort((a, b) => a.chapter_num - b.chapter_num);

  function handleCreate() {
    void callbacksRef.current?.onCreateChapter();
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    const callbacks = callbacksRef.current;
    try {
      if (!callbacks || !await callbacks.onBeforeChapterDelete()) return;
      try {
        const result = await deleteChapter(deleteTarget.id, projectId);
        if (result.error) toast.error(result.error);
        else {
          callbacks.onChapterDeleted(deleteTarget.id);
          toast.success("챕터가 삭제되었습니다");
        }
      } finally {
        callbacks.onChapterDeleteFinished();
      }
    } catch {
      toast.error("챕터를 삭제하지 못했습니다. 다시 시도해 주세요.");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }

  return expanded ? (
    <>
      <ExpandedChapterList
        projectName={projectName}
        projectGenre={projectGenre}
        chapters={sorted}
        activeChapterId={activeChapterId}
        isCreating={isCreating}
        onCreate={handleCreate}
        onSelectChapter={(chapter) => { void callbacksRef.current?.onSelectChapter(chapter); setOpenMobile(false); }}
        onDeleteChapter={setDeleteTarget}
      />
      <ChapterDeleteDialog
        chapter={deleteTarget}
        isDeleting={isDeleting}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        onConfirm={handleDeleteConfirm}
      />
    </>
  ) : (
    <CollapsedChapterList
      chapters={sorted}
      activeChapterId={activeChapterId}
      isCreating={isCreating}
      onCreate={handleCreate}
      onSelectChapter={(chapter) => { void callbacksRef.current?.onSelectChapter(chapter); setOpenMobile(false); }}
    />
  );
}
