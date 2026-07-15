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
import { Plus } from "lucide-react";
import { createGenreKit } from "@/app/(dashboard)/genre-kits/actions";
import { GenreRulesEditor } from "@/components/genre-rules-editor";
import { GENRES } from "@/lib/constants";
import { toast } from "sonner";
import type { GenreRule } from "@/types";

export function CreateGenreKitDialog() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [rules, setRules] = useState<GenreRule[]>([
    { category: "일관성", rule: "" },
  ]);
  const [isPublic, setIsPublic] = useState(false);

  async function handleSubmit(formData: FormData) {
    formData.set("rules", JSON.stringify(rules.filter((r) => r.rule.trim())));
    formData.set("is_public", String(isPublic));
    setPending(true);
    const result = await createGenreKit(formData);
    setPending(false);

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("장르 킷이 생성되었습니다");
      setOpen(false);
      setRules([{ category: "일관성", rule: "" }]);
      setIsPublic(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 size-4" />
          장르 킷 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>새 장르 킷 만들기</DialogTitle>
        </DialogHeader>
        <form action={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">이름</Label>
            <Input id="name" name="name" placeholder="킷 이름" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="genre_type">장르 분류</Label>
            <Select name="genre_type" required>
              <SelectTrigger>
                <SelectValue placeholder="장르 선택" />
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
              id="is_public"
              checked={isPublic}
              onCheckedChange={(v) => setIsPublic(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <Label htmlFor="is_public" className="cursor-pointer">
                공개
              </Label>
              <p className="text-xs text-muted-foreground">
                공개하면 다른 사용자도 이 장르 킷을 볼 수 있습니다
              </p>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "생성 중..." : "장르 킷 생성"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
