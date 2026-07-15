"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { updateEntity } from "@/app/(dashboard)/projects/[id]/codex-actions";
import { toast } from "sonner";
import type { Entity, EntityType } from "@/types";

const ENTITY_TYPES: { label: string; value: EntityType }[] = [
  { label: "캐릭터", value: "CHARACTER" },
  { label: "장소", value: "PLACE" },
  { label: "아이템", value: "ITEM" },
  { label: "조직", value: "ORGANIZATION" },
  { label: "개념", value: "CONCEPT" },
  { label: "마법체계", value: "MAGIC_SYSTEM" },
];

export function EditEntityDialog({
  entity,
  projectId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  entity: Entity;
  projectId: string;
  /** 외부에서 제어할 때 (trigger 없이 사용) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [pending, setPending] = useState(false);

  const aliasesStr = Array.isArray(entity.aliases)
    ? (entity.aliases as string[]).join(", ")
    : "";

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = await updateEntity(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("작품 기억 항목이 수정되었습니다");
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* trigger는 외부 제어가 없을 때만 렌더 */}
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Pencil className="mr-2 size-4" />
            수정
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="bg-[var(--sw-bg-elevated)] border border-[var(--sw-border-default)] text-[var(--sw-text-primary)] shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-[var(--sw-text-primary)] text-base font-semibold">작품 기억 항목 수정</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="entityId" value={entity.id} />
          <input type="hidden" name="projectId" value={projectId} />
          <div className="space-y-1.5">
            <Label htmlFor="edit-name" className="text-[var(--sw-text-secondary)] text-xs font-medium">이름</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={entity.name}
              required
              className="bg-[var(--sw-bg-surface)] border-[var(--sw-border-default)] text-[var(--sw-text-primary)] placeholder:text-[var(--sw-text-muted)] focus-visible:ring-[var(--sw-accent)] focus-visible:border-[var(--sw-border-focus)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-type" className="text-[var(--sw-text-secondary)] text-xs font-medium">분류</Label>
            <Select name="type" defaultValue={entity.type}>
              <SelectTrigger className="bg-[var(--sw-bg-surface)] border-[var(--sw-border-default)] text-[var(--sw-text-primary)] focus:ring-[var(--sw-accent)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[var(--sw-bg-elevated)] border-[var(--sw-border-default)] text-[var(--sw-text-primary)]">
                {ENTITY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value} className="focus:bg-[var(--sw-bg-active)] focus:text-[var(--sw-text-primary)]">
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-summary" className="text-[var(--sw-text-secondary)] text-xs font-medium">작품 기억 요약</Label>
            <Textarea
              id="edit-summary"
              name="summary"
              defaultValue={entity.summary ?? ""}
              rows={3}
              className="bg-[var(--sw-bg-surface)] border-[var(--sw-border-default)] text-[var(--sw-text-primary)] placeholder:text-[var(--sw-text-muted)] focus-visible:ring-[var(--sw-accent)] focus-visible:border-[var(--sw-border-focus)] resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-aliases" className="text-[var(--sw-text-secondary)] text-xs font-medium">별칭/호칭</Label>
            <Input
              id="edit-aliases"
              name="aliases"
              defaultValue={aliasesStr}
              placeholder="쉼표로 구분"
              className="bg-[var(--sw-bg-surface)] border-[var(--sw-border-default)] text-[var(--sw-text-primary)] placeholder:text-[var(--sw-text-muted)] focus-visible:ring-[var(--sw-accent)] focus-visible:border-[var(--sw-border-focus)]"
            />
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[var(--sw-cta)] text-[var(--sw-bg-base)] font-medium hover:bg-[var(--sw-cta)]/90 disabled:opacity-50"
          >
            {pending ? "저장 중..." : "저장"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
