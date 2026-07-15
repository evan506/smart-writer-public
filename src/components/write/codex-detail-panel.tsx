"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, X } from "lucide-react";
import {
  FACT_TYPE_LABELS,
  formatFactFallbackSourceLabel,
  formatFactSourceLabel,
} from "@/components/codex-detail-panel/facts-section";
import {
  RELATION_COLORS,
  RELATION_TYPE_LABELS,
  getEntityTypeConfig,
} from "@/lib/design-tokens";
import { ENTITY_TYPES, getTypeColor } from "./codex-panel-constants";
import type { CodexFieldValue, EnrichedEntity } from "./codex-panel-types";

export function CodexDetailPanel({
  entity,
  onClose,
  onFieldSave,
  onDeleteLink,
  onDelete,
  onSelectChapter,
  isPending,
}: {
  entity: EnrichedEntity;
  onClose: () => void;
  onFieldSave: (field: string, value: CodexFieldValue) => void;
  onDeleteLink: (linkId: string) => void;
  onDelete: () => void;
  onSelectChapter?: (chapterId: string) => void;
  isPending: boolean;
}) {
  const typeColor = getTypeColor(entity.type);

  const [name, setName] = useState(entity.name);
  const [summary, setSummary] = useState(entity.summary ?? "");
  const [aliasInput, setAliasInput] = useState("");

  useEffect(() => {
    setName(entity.name);
  }, [entity.name]);

  useEffect(() => {
    setSummary(entity.summary ?? "");
  }, [entity.summary]);

  function saveName() {
    const trimmed = name.trim();
    if (trimmed && trimmed !== entity.name) {
      onFieldSave("name", trimmed);
    } else {
      setName(entity.name);
    }
  }

  function saveSummary() {
    const value = summary.trim();
    if (value !== (entity.summary ?? "")) {
      onFieldSave("summary", value || null);
    }
  }

  function removeAlias(index: number) {
    const newAliases = entity.aliases.filter((_, aliasIndex) => aliasIndex !== index);
    onFieldSave("aliases", newAliases.length > 0 ? newAliases : null);
  }

  function addAlias() {
    const trimmed = aliasInput.trim();
    if (trimmed && !entity.aliases.includes(trimmed)) {
      onFieldSave("aliases", [...entity.aliases, trimmed]);
      setAliasInput("");
    }
  }

  return (
    <div
      className="mt-2 rounded-md pb-3"
      style={{
        borderTop: "1px solid var(--sw-border-default)",
        paddingTop: "12px",
      }}
    >
      <div className="mb-2 flex items-start justify-between px-1">
        <div>
          <div className="text-sm font-bold" style={{ color: "var(--sw-text-primary)" }}>
            {entity.name}
          </div>
          <span
            className="mt-0.5 inline-block rounded-[3px] px-1.5 py-px text-[9px] font-semibold uppercase"
            style={{ background: typeColor.bg, color: typeColor.color }}
          >
            {getEntityTypeConfig(entity.type).label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-xs transition-colors"
          style={{ color: "var(--sw-text-muted)" }}
        >
          ✕
        </button>
      </div>

      <div className="space-y-3 px-1">
        <Textarea
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          onBlur={saveSummary}
          placeholder="작품 기억 요약..."
          className="min-h-[48px] resize-none rounded-md text-xs leading-relaxed"
          style={{
            background: "var(--sw-bg-raised)",
            border: "1px solid var(--sw-border-default)",
            color: "var(--sw-text-secondary)",
          }}
          rows={2}
          disabled={isPending}
        />

        <div className="flex flex-wrap gap-1">
          {entity.aliases.map((alias, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 rounded-[3px] py-px pl-1.5 pr-1 text-[10px] font-medium"
              style={{
                background: "var(--sw-bg-raised)",
                border: "1px solid var(--sw-border-default)",
                color: "var(--sw-text-muted)",
              }}
            >
              {alias}
              <button
                onClick={() => removeAlias(index)}
                className="hover:opacity-70"
                disabled={isPending}
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
          <input
            value={aliasInput}
            onChange={(event) => setAliasInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addAlias();
              }
            }}
            onBlur={() => {
              if (aliasInput.trim()) addAlias();
            }}
            placeholder="+ 별칭/호칭"
            className="min-w-[40px] flex-1 bg-transparent px-1 text-[10px] outline-none"
            style={{ color: "var(--sw-text-muted)" }}
            disabled={isPending}
          />
        </div>

        {entity.facts.length > 0 && (
          <div>
            <div
              className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--sw-text-muted)" }}
            >
              승인된 설정
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "9.5px",
                  opacity: 0.6,
                }}
              >
                {entity.facts.length}개
              </span>
            </div>
            <div className="space-y-1">
              {entity.facts.map((fact) => {
                const visibleSources = fact.sources.slice(0, 2);
                const hiddenSourceCount = Math.max(fact.sources.length - visibleSources.length, 0);
                const primarySourceLabel = visibleSources[0]
                  ? formatFactSourceLabel(visibleSources[0])
                  : formatFactFallbackSourceLabel(fact);
                return (
                  <div
                    key={fact.id}
                    className="rounded-md px-2 py-1.5"
                    style={{
                      background: "var(--sw-bg-raised)",
                      border: "1px solid var(--sw-border-default)",
                    }}
                  >
                    <div className="flex items-start gap-1.5">
                      <span
                        className="shrink-0 rounded-[3px] px-1.5 py-px text-[9px] font-semibold"
                        style={{
                          background: "var(--sw-bg-active)",
                          color: "var(--sw-text-muted)",
                        }}
                      >
                        {FACT_TYPE_LABELS[fact.factType] ?? fact.factType}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[11px] leading-[1.45]"
                          style={{ color: "var(--sw-text-secondary)" }}
                        >
                          {fact.value}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {fact.factKey && (
                            <span
                              className="text-[9.5px]"
                              style={{ color: "var(--sw-text-muted)" }}
                            >
                              {fact.factKey}
                            </span>
                          )}
                          {primarySourceLabel && (
                            <span
                              className="text-[9.5px]"
                              style={{ color: "var(--sw-text-muted)" }}
                            >
                              {primarySourceLabel}
                              {fact.sources.length > 1 && ` 외 ${fact.sources.length - 1}개`}
                            </span>
                          )}
                        </div>
                        {visibleSources.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {visibleSources.map((source) => {
                              const sourceLabel = formatFactSourceLabel(source);
                              return (
                                <div
                                  key={source.id}
                                  className="line-clamp-2 text-[10px] leading-[1.35]"
                                  style={{ color: "var(--sw-text-muted)" }}
                                >
                                  {sourceLabel && (
                                    <span style={{ color: "var(--sw-text-ghost)" }}>
                                      {sourceLabel}:{" "}
                                    </span>
                                  )}
                                  {source.evidenceText ?? "근거 원문 없음"}
                                </div>
                              );
                            })}
                            {hiddenSourceCount > 0 && (
                              <div
                                className="text-[9.5px]"
                                style={{ color: "var(--sw-text-ghost)" }}
                              >
                                근거 {hiddenSourceCount}개 더 있음
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {entity.links.length > 0 && (
          <div>
            <div
              className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--sw-text-muted)" }}
            >
              관계
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "9.5px",
                  opacity: 0.6,
                }}
              >
                {entity.links.length}개
              </span>
            </div>
            <div className="space-y-0.5">
              {entity.links.map((link) => {
                const relationColor = RELATION_COLORS[link.relationType] ?? "var(--sw-text-muted)";

                return (
                  <div key={link.id} className="flex items-center gap-1.5 py-1 text-[11px]">
                    <span className="size-1 shrink-0 rounded-full" style={{ background: relationColor }} />
                    <span className="flex-1 font-medium" style={{ color: "var(--sw-text-secondary)" }}>
                      {link.relatedName}
                    </span>
                    <span
                      className="shrink-0 rounded-[3px] px-1.5 py-px text-[9px]"
                      style={{
                        background: "var(--sw-bg-raised)",
                        color: "var(--sw-text-muted)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}
                    >
                      {RELATION_TYPE_LABELS[link.relationType] ?? link.relationType}
                    </span>
                    <button
                      onClick={() => onDeleteLink(link.id)}
                      className="shrink-0 opacity-0 transition-opacity hover:opacity-100"
                      style={{ color: "var(--sw-text-muted)" }}
                      disabled={isPending}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div>
            <label
              className="text-[10px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--sw-text-muted)" }}
            >
              이름
            </label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              className="mt-1 h-7 rounded-md text-xs"
              style={{
                background: "var(--sw-bg-raised)",
                border: "1px solid var(--sw-border-default)",
                color: "var(--sw-text-primary)",
              }}
              disabled={isPending}
            />
          </div>

          <div>
            <label
              className="text-[10px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--sw-text-muted)" }}
            >
              분류
            </label>
            <Select
              value={entity.type}
              onValueChange={(value) => onFieldSave("type", value)}
              disabled={isPending}
            >
              <SelectTrigger
                className="mt-1 h-7 rounded-md text-xs"
                style={{
                  background: "var(--sw-bg-raised)",
                  border: "1px solid var(--sw-border-default)",
                  color: "var(--sw-text-primary)",
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ENTITY_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {entity.chapters.length > 0 && (
          <div>
            <div
              className="mb-1 text-[10px] font-semibold uppercase tracking-[0.5px]"
              style={{ color: "var(--sw-text-muted)" }}
            >
              등장 ({entity.chapters.length}화)
            </div>
            <div className="flex flex-wrap gap-1">
              {entity.chapters.map((chapter) => (
                <button
                  key={chapter.chapterId}
                  onClick={() => onSelectChapter?.(chapter.chapterId)}
                  className="rounded-[3px] px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                  style={{
                    background: "var(--sw-bg-raised)",
                    border: "1px solid var(--sw-border-default)",
                    color: "var(--sw-text-muted)",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {chapter.chapterNum}화
                </button>
              ))}
            </div>
          </div>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="flex w-full items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-colors"
              style={{
                background: "rgba(163, 90, 69, 0.1)",
                color: "var(--sw-danger)",
                border: "1px solid rgba(163, 90, 69, 0.24)",
              }}
              disabled={isPending}
            >
              <Trash2 className="size-3" />
              항목 삭제
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>작품 기억 항목 삭제</AlertDialogTitle>
              <AlertDialogDescription>
                &ldquo;{entity.name}&rdquo;을(를) 삭제하시겠습니까? 관련된 관계와
                멘션도 함께 삭제됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>삭제</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
