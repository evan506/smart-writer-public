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

export function ProjectDeleteDialog({
  title,
  open,
  pending,
  onOpenChange,
  onDelete,
}: {
  title: string;
  open: boolean;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>프로젝트를 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>&ldquo;{title}&rdquo;</strong> 프로젝트와 관련된 모든 챕터,
            작품 기억, 관계, 확인 항목이 영구적으로 삭제됩니다. 이 작업은 되돌릴
            수 없습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>취소</AlertDialogCancel>
          <AlertDialogAction onClick={onDelete} disabled={pending}>
            {pending ? "삭제 중..." : "삭제"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
