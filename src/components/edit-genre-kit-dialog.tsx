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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { updateGenreKit } from "@/app/(dashboard)/genre-kits/actions";
import { GenreRulesEditor } from "@/components/genre-rules-editor";
import { GENRES } from "@/lib/constants";
import { toast } from "sonner";
import type { GenreKit, GenreRule } from "@/types";

export function EditGenreKitDialog({ kit }: { kit: GenreKit }) {
  const [open, setOpen] = useState(false);
  const initialRules = (kit.rules as unknown as GenreRule[]) ?? [];
  const [rules, setRules] = useState<GenreRule[]>(initialRules);
  const [isPublic, setIsPublic] = useState(kit.is_public ?? false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    formData.set("kitId", kit.id);
    formData.set("rules", JSON.stringify(rules.filter((r) => r.rule.trim())));
    formData.set("is_public", String(isPublic));
    setPending(true);
    const result = await updateGenreKit(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("장르 킷이 수정되었습니다");
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="mr-1 size-4" />
          수정
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>장르 킷 수정</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">이름</Label>
            <Input
              id="edit-name"
              name="name"
              defaultValue={kit.name}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-genre_type">장르 분류</Label>
            <Select name="genre_type" defaultValue={kit.genre_type}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENRES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>규칙</Label>
            <GenreRulesEditor value={rules} onChange={setRules} />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox
              id="edit-is_public"
              checked={isPublic}
              onCheckedChange={(v) => setIsPublic(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="edit-is_public" className="cursor-pointer">
                공개
              </Label>
              <p className="text-xs text-muted-foreground">
                공개하면 다른 사용자도 이 장르 킷을 볼 수 있습니다
              </p>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "수정 중..." : "저장"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
