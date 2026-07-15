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
import { Plus } from "lucide-react";
import { createEntity } from "@/app/(dashboard)/projects/[id]/codex-actions";
import { toast } from "sonner";
import type { EntityType } from "@/types";

const ENTITY_TYPES: { label: string; value: EntityType }[] = [
  { label: "캐릭터", value: "CHARACTER" },
  { label: "장소", value: "PLACE" },
  { label: "아이템", value: "ITEM" },
  { label: "조직", value: "ORGANIZATION" },
  { label: "개념", value: "CONCEPT" },
  { label: "마법체계", value: "MAGIC_SYSTEM" },
];

export function CreateEntityDialog({
  projectId,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  projectId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    const result = await createEntity(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("작품 기억에 추가되었습니다");
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {controlledOpen === undefined && (
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-2 size-4" />
            항목 추가
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="bg-[var(--sw-bg-elevated)] border border-[var(--sw-border-default)] text-[var(--sw-text-primary)] shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-[var(--sw-text-primary)] text-base font-semibold">작품 기억 항목 추가</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="projectId" value={projectId} />
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-[var(--sw-text-secondary)] text-xs font-medium">이름</Label>
            <Input
              id="name"
              name="name"
              placeholder="인물, 장소, 설정 이름"
              required
              className="bg-[var(--sw-bg-surface)] border-[var(--sw-border-default)] text-[var(--sw-text-primary)] placeholder:text-[var(--sw-text-muted)] focus-visible:ring-[var(--sw-accent)] focus-visible:border-[var(--sw-border-focus)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="type" className="text-[var(--sw-text-secondary)] text-xs font-medium">분류</Label>
            <Select name="type" required>
              <SelectTrigger className="bg-[var(--sw-bg-surface)] border-[var(--sw-border-default)] text-[var(--sw-text-primary)] focus:ring-[var(--sw-accent)]">
                <SelectValue placeholder="분류 선택" />
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
            <Label htmlFor="summary" className="text-[var(--sw-text-secondary)] text-xs font-medium">작품 기억 요약</Label>
            <Textarea
              id="summary"
              name="summary"
              placeholder="작품 안에서 기억할 설명 (선택)"
              rows={3}
              className="bg-[var(--sw-bg-surface)] border-[var(--sw-border-default)] text-[var(--sw-text-primary)] placeholder:text-[var(--sw-text-muted)] focus-visible:ring-[var(--sw-accent)] focus-visible:border-[var(--sw-border-focus)] resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aliases" className="text-[var(--sw-text-secondary)] text-xs font-medium">별칭/호칭</Label>
            <Input
              id="aliases"
              name="aliases"
              placeholder="쉼표로 구분"
              className="bg-[var(--sw-bg-surface)] border-[var(--sw-border-default)] text-[var(--sw-text-primary)] placeholder:text-[var(--sw-text-muted)] focus-visible:ring-[var(--sw-accent)] focus-visible:border-[var(--sw-border-focus)]"
            />
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-[var(--sw-cta)] text-[var(--sw-bg-base)] font-medium hover:bg-[var(--sw-cta)]/90 disabled:opacity-50"
          >
            {pending ? "생성 중..." : "항목 추가"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
