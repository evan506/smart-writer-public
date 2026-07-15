"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X } from "lucide-react";
import { RULE_CATEGORIES } from "@/lib/constants";
import type { GenreRule } from "@/types";

export function GenreRulesEditor({
  value,
  onChange,
}: {
  value: GenreRule[];
  onChange: (rules: GenreRule[]) => void;
}) {
  function addRule() {
    onChange([...value, { category: "일관성", rule: "" }]);
  }

  function removeRule(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function updateRule(index: number, field: keyof GenreRule, val: string) {
    const updated = value.map((r, i) =>
      i === index ? { ...r, [field]: val } : r
    );
    onChange(updated);
  }

  return (
    <div className="space-y-3">
      {value.map((rule, i) => (
        <div key={i} className="flex gap-2 items-start">
          <Select
            value={rule.category}
            onValueChange={(v) => updateRule(i, "category", v)}
          >
            <SelectTrigger className="w-[120px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RULE_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={rule.rule}
            onChange={(e) => updateRule(i, "rule", e.target.value)}
            placeholder="규칙을 입력하세요"
            rows={1}
            className="min-h-[36px] resize-none"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => removeRule(i)}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRule}>
        <Plus className="mr-1 size-4" />
        규칙 추가
      </Button>
    </div>
  );
}
