"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  createChapter,
  deleteChapter,
} from "@/app/(dashboard)/projects/[id]/chapters-actions";
import { useWriteSidebar } from "@/components/write/write-sidebar-context";
import type { Chapter } from "@/types";
import { ChapterDeleteDialog } from "./chapter-delete-dialog";
import { CollapsedChapterList, ExpandedChapterList } from "./chapter-list-parts";

export function WriteChapterSidebar({ expanded }: { expanded: boolean }) {
  const { data, callbacksRef } = useWriteSidebar();
  const [isCreating, startCreating] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<Chapter | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!data) return null;

  const { projectId, projectName, projectGenre, chapters, activeChapterId } = data;
  const sorted = [...chapters].sort((a, b) => a.chapter_num - b.chapter_num);

  function handleCreate() {
    startCreating(async () => {
      const nextNum =
        chapters.length > 0
          ? Math.max(...chapters.map((chapter) => chapter.chapter_num)) + 1
          : 1;
      const formData = new FormData();
      formData.set("projectId", projectId);
      formData.set("chapterNum", String(nextNum));
      formData.set("title", "");
      const result = await createChapter(formData);
      if (result.error) {
        toast.error(result.error);
      } else if (result.id) {
        const newChapter: Chapter = {
          id: result.id,
          project_id: projectId,
          chapter_num: nextNum,
          title: null,
          content: null,
          word_count: 0,
          summary: null,
          arc_summary: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        await callbacksRef.current?.onChapterCreated(newChapter);
      }
    });
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await deleteChapter(deleteTarget.id, projectId);
    setIsDeleting(false);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("챕터가 삭제되었습니다");
      callbacksRef.current?.onChapterDeleted(deleteTarget.id);
    }
    setDeleteTarget(null);
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
        onSelectChapter={(chapter) => callbacksRef.current?.onSelectChapter(chapter)}
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
      onSelectChapter={(chapter) => callbacksRef.current?.onSelectChapter(chapter)}
    />
  );
}
