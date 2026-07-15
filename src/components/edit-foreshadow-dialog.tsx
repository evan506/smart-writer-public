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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { updateForeshadow } from "@/app/(dashboard)/projects/[id]/foreshadows/actions";
import { toast } from "sonner";
import type { Entity, Foreshadow, ForeshadowStatus } from "@/types";

const STATUS_OPTIONS: { label: string; value: ForeshadowStatus }[] = [
  { label: "심어짐", value: "PLANTED" },
  { label: "회수됨", value: "REVEALED" },
  { label: "폐기됨", value: "ABANDONED" },
];

export function EditForeshadowDialog({
  foreshadow,
  projectId,
  entities,
}: {
  foreshadow: Foreshadow;
  projectId: string;
  entities: Entity[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const existingEntityIds = (foreshadow.entity_ids ?? []) as string[];
  const [selectedEntityIds, setSelectedEntityIds] =
    useState<string[]>(existingEntityIds);

  function toggleEntity(entityId: string) {
    setSelectedEntityIds((prev) =>
      prev.includes(entityId)
        ? prev.filter((id) => id !== entityId)
        : [...prev, entityId]
    );
  }

  async function handleSubmit(formData: FormData) {
    selectedEntityIds.forEach((eid) => formData.append("entity_ids", eid));
    setPending(true);
    const result = await updateForeshadow(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("복선이 수정되었습니다");
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-sw-border-default text-sw-text-secondary hover:bg-sw-bg-hover hover:text-sw-text-primary"
        >
          <Pencil className="mr-2 size-4" />
          수정
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto bg-sw-bg-elevated border-sw-border-default text-sw-text-primary shadow-2xl sw-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-sw-text-primary text-base font-semibold">
            복선 수정
          </DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="foreshadowId" value={foreshadow.id} />
          <input type="hidden" name="projectId" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="edit-description" className="text-sw-text-secondary text-xs font-medium">
              설명
            </Label>
            <Textarea
              id="edit-description"
              name="description"
              defaultValue={foreshadow.description ?? ""}
              rows={3}
              required
              className="bg-sw-bg-surface border-sw-border-default text-sw-text-primary placeholder:text-sw-text-muted focus-visible:ring-sw-accent focus-visible:border-sw-border-focus resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="edit-planted" className="text-sw-text-secondary text-xs font-medium">
                심은 회차
              </Label>
              <Input
                id="edit-planted"
                name="planted_chapter"
                type="number"
                min={1}
                defaultValue={foreshadow.planted_chapter}
                required
                className="bg-sw-bg-surface border-sw-border-default text-sw-text-primary placeholder:text-sw-text-muted focus-visible:ring-sw-accent focus-visible:border-sw-border-focus"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-reveal" className="text-sw-text-secondary text-xs font-medium">
                회수 예정 회차
              </Label>
              <Input
                id="edit-reveal"
                name="expected_reveal"
                type="number"
                min={1}
                defaultValue={foreshadow.expected_reveal ?? ""}
                className="bg-sw-bg-surface border-sw-border-default text-sw-text-primary placeholder:text-sw-text-muted focus-visible:ring-sw-accent focus-visible:border-sw-border-focus"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status" className="text-sw-text-secondary text-xs font-medium">
              상태
            </Label>
            <Select
              name="status"
              defaultValue={foreshadow.status as ForeshadowStatus}
            >
              <SelectTrigger className="bg-sw-bg-surface border-sw-border-default text-sw-text-primary focus:ring-sw-accent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-sw-bg-elevated border-sw-border-default text-sw-text-primary">
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem
                    key={opt.value}
                    value={opt.value}
                    className="focus:bg-sw-bg-active focus:text-sw-text-primary"
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {entities.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sw-text-secondary text-xs font-medium">관련 작품 기억 항목</Label>
              <div className="sw-scrollbar max-h-40 overflow-y-auto rounded-md border border-sw-border-default p-2 space-y-1">
                {entities.map((entity) => (
                  <label
                    key={entity.id}
                    className="flex items-center gap-2 rounded px-2 py-1 hover:bg-sw-bg-hover cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedEntityIds.includes(entity.id)}
                      onCheckedChange={() => toggleEntity(entity.id)}
                      className="border-sw-border-default data-[state=checked]:bg-sw-accent data-[state=checked]:border-sw-accent data-[state=checked]:text-sw-bg-base"
                    />
                    <span className="text-sm text-sw-text-primary">{entity.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <Button
            type="submit"
            disabled={pending}
            className="w-full bg-sw-cta text-sw-bg-base font-medium hover:bg-sw-cta/90 disabled:opacity-50"
          >
            {pending ? "저장 중..." : "저장"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
