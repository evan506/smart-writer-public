"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Chapter } from "@/types";

export function ChapterDeleteDialog({
  chapter,
  isDeleting,
  onOpenChange,
  onConfirm,
}: {
  chapter: Chapter | null;
  isDeleting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={chapter !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>챕터를 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>
              {chapter
                ? `Ch.${chapter.chapter_num} ${chapter.title || "제목 없음"}`
                : ""}
            </strong>{" "}
            챕터와 관련된 본문 조각, 언급, 확인 항목이 영구적으로 삭제됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>취소</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isDeleting}>
            {isDeleting ? "삭제 중…" : "삭제"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
