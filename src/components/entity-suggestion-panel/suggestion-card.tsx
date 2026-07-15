"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Check, ChevronDown, Pencil, X } from "lucide-react";
import type { EntitySuggestion, EntityType } from "@/types";
import { RELATION_TYPE_LABELS } from "@/lib/design-tokens";
import { ConfBadge } from "./conf-badge";
import { AliasControls } from "./alias-controls";
import { ENTITY_TYPES, inputStyle, TYPE_COLORS, TYPE_LABELS } from "./constants";
import type { AliasTarget, EditForm, SuggestionHandlers } from "./types";

export function SuggestionCard({
  suggestion,
  aliasTargets,
  editingId,
  editForm,
  setEditForm,
  isPending,
  isHighlighted,
  setEditingId,
  handlers,
}: {
  suggestion: EntitySuggestion;
  aliasTargets: AliasTarget[];
  editingId: string | null;
  editForm: EditForm;
  setEditForm: Dispatch<SetStateAction<EditForm>>;
  isPending: boolean;
  isHighlighted: boolean;
  setEditingId: (id: string | null) => void;
  handlers: SuggestionHandlers;
}) {
  const typeColor = TYPE_COLORS[suggestion.type] ?? TYPE_COLORS.CONCEPT;
  const isEditing = editingId === suggestion.id;
  const isMergeSuggestion = suggestion.suggested_action === "MERGE";
  const isRelationSuggestion = suggestion.type === "RELATION";
  const statusLabel = isRelationSuggestion
    ? "관계 후보"
    : isMergeSuggestion
      ? "별칭/호칭 후보"
      : "새 작품 기억 후보";
  const [aliasTargetId, setAliasTargetId] = useState(suggestion.matched_entity_id ?? "");
  const [showAliasPicker, setShowAliasPicker] = useState(false);
  const aliasableTargets = aliasTargets.filter((target) => target.name !== suggestion.name);
  const selectedAliasTarget = aliasableTargets.find((target) => target.id === aliasTargetId);

  useEffect(() => {
    if (isMergeSuggestion) {
      setAliasTargetId(suggestion.matched_entity_id ?? "");
    }
  }, [isMergeSuggestion, suggestion.matched_entity_id]);

  return (
    <div
      data-suggestion-id={suggestion.id}
      data-highlighted={isHighlighted ? "true" : undefined}
      style={{
        borderRadius: "8px",
        background: "var(--sw-bg-elevated)",
        border: isHighlighted
          ? "1px solid var(--sw-warning)"
          : "1px dashed var(--sw-border-hover)",
        boxShadow: isHighlighted
          ? "0 0 0 3px rgba(182, 134, 42, 0.14)"
          : undefined,
        padding: "10px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
      }}
    >
      {isEditing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <input
            value={editForm.name}
            onChange={(e) => setEditForm((form) => ({ ...form, name: e.target.value }))}
            placeholder="이름"
            style={inputStyle}
          />
          <div style={{ position: "relative" }}>
            <select
              value={editForm.type}
              onChange={(e) => setEditForm((form) => ({ ...form, type: e.target.value as EntityType }))}
              style={{ ...inputStyle, appearance: "none", paddingRight: "28px", cursor: "pointer" }}
            >
              {ENTITY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
            <ChevronDown size={12} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--sw-text-dim)", pointerEvents: "none" }} />
          </div>
          <textarea
            value={editForm.summary}
            onChange={(e) => setEditForm((form) => ({ ...form, summary: e.target.value }))}
            placeholder="요약"
            rows={2}
            style={{ ...inputStyle, resize: "none", lineHeight: 1.5 }}
          />
          <input
            value={editForm.aliases}
            onChange={(e) => setEditForm((form) => ({ ...form, aliases: e.target.value }))}
            placeholder="별칭 (쉼표 구분)"
            style={inputStyle}
          />
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              disabled={isPending}
              onClick={() => handlers.handleConfirm(suggestion.id, {
                name: editForm.name,
                type: editForm.type,
                summary: editForm.summary || undefined,
                aliases: editForm.aliases ? editForm.aliases.split(",").map((alias) => alias.trim()).filter(Boolean) : undefined,
              })}
              style={{
                flex: 1, padding: "6px", borderRadius: "6px", fontSize: "11px", fontWeight: 700,
                background: "var(--sw-cta)", color: "#fffaf1", border: "none", cursor: "pointer",
                fontFamily: "var(--sw-font-sans)", opacity: isPending ? 0.5 : 1,
              }}
            >
              수정해서 기억
            </button>
            <button
              onClick={() => setEditingId(null)}
              style={{
                padding: "6px 10px", borderRadius: "6px", fontSize: "11px",
                background: "var(--sw-bg-overlay)", border: "1px solid var(--sw-border-default)",
                color: "var(--sw-text-dim)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
              }}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--sw-text-primary)" }}>
              {suggestion.name}
            </span>
            <span style={{
              fontSize: "10px", fontWeight: 800, padding: "1px 6px", borderRadius: "20px",
              background: "var(--sw-bg-raised)", color: "var(--sw-text-muted)",
              border: "1px solid var(--sw-border-default)",
            }}>
              검토 필요
            </span>
            <span style={{
              fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "20px",
              background: isRelationSuggestion ? "var(--sw-warn-soft)" : "var(--sw-accent-bg)",
              color: isRelationSuggestion ? "var(--sw-warning)" : "var(--sw-accent)",
              border: isRelationSuggestion ? "1px solid rgba(182, 134, 42, 0.28)" : "1px solid var(--sw-accent-border)",
            }}>
              {statusLabel}
            </span>
            <span style={{
              fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "20px",
              background: typeColor.bg, color: typeColor.text, border: `1px solid ${typeColor.border}`,
              letterSpacing: "0.02em",
            }}>
              {TYPE_LABELS[suggestion.type] ?? suggestion.type}
            </span>
            {isRelationSuggestion && suggestion.summary && (
              <span style={{
                fontSize: "10px", padding: "1px 6px", borderRadius: "20px",
                background: "var(--sw-warn-soft)", color: "var(--sw-warning)",
                border: "1px solid rgba(182, 134, 42, 0.28)",
              }}>
                {RELATION_TYPE_LABELS[suggestion.summary] ?? suggestion.summary}
              </span>
            )}
            <ConfBadge value={suggestion.confidence} />
          </div>

          {suggestion.context_snippet ? (
            <div style={{
              margin: 0, padding: "8px 10px",
              borderLeft: `3px solid ${typeColor.text}`,
              background: "var(--sw-bg-raised)",
              borderRadius: "6px",
              fontSize: "11px", color: "var(--sw-text-dim)",
              lineHeight: 1.5,
            }}>
              <div style={{ fontSize: "9.5px", fontWeight: 800, color: "var(--sw-text-ghost)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "4px", fontStyle: "normal" }}>
                원문 근거 · 작가 판단 기준
              </div>
              <div style={{ fontStyle: "italic" }}>
                &lsquo;{suggestion.context_snippet}&rsquo;
              </div>
              <div style={{ marginTop: "5px", color: "var(--sw-text-ghost)", fontStyle: "normal" }}>
                이 문장을 먼저 확인한 뒤 canon 저장 여부를 결정하세요.
              </div>
            </div>
          ) : (
            <div style={{
              margin: 0, padding: "8px 10px",
              background: "var(--sw-warn-soft)",
              border: "1px solid rgba(182, 134, 42, 0.22)",
              borderRadius: "6px",
              fontSize: "11px", color: "var(--sw-warning)",
              lineHeight: 1.5,
            }}>
              원문 근거가 연결되지 않은 후보입니다. 승인 전 원고 위치를 확인하세요.
            </div>
          )}

          {!isRelationSuggestion && suggestion.summary && (
            <p style={{ fontSize: "11px", color: "var(--sw-text-primary)", lineHeight: 1.55, margin: 0, opacity: 0.8 }}>
              AI 제안 요약: {suggestion.summary}
            </p>
          )}

          {isRelationSuggestion && (
            <p style={{ fontSize: "10.5px", color: "var(--sw-text-ghost)", lineHeight: 1.5, margin: 0 }}>
              승인 전에는 Codex/검색/그래프의 확정 canon으로 쓰지 않습니다.
            </p>
          )}

          {!isRelationSuggestion && isMergeSuggestion && !showAliasPicker && selectedAliasTarget && (
            <button
              type="button"
              onClick={() => setShowAliasPicker(true)}
              disabled={isPending}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "8px",
                padding: "7px 8px",
                borderRadius: "6px",
                background: "var(--sw-bg-raised)",
                border: "1px solid var(--sw-border-muted)",
                color: "var(--sw-text-muted)",
                cursor: "pointer",
                fontFamily: "var(--sw-font-sans)",
                textAlign: "left",
                opacity: isPending ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: "10.5px", lineHeight: 1.4 }}>
                별칭 저장 대상
              </span>
              <strong style={{ fontSize: "11px", color: "var(--sw-accent)", fontWeight: 800 }}>
                {selectedAliasTarget.name}
              </strong>
            </button>
          )}

          {!isRelationSuggestion && showAliasPicker && (
            <AliasControls
              suggestion={suggestion}
              aliasableTargets={aliasableTargets}
              selectedAliasTarget={selectedAliasTarget}
              aliasTargetId={aliasTargetId}
              isMergeSuggestion={isMergeSuggestion}
              isPending={isPending}
              setAliasTargetId={setAliasTargetId}
              setShowAliasPicker={setShowAliasPicker}
              handleConfirmAsAlias={handlers.handleConfirmAsAlias}
              handleRejectAliasTarget={handlers.handleRejectAliasTarget}
            />
          )}

          <div style={{ display: "flex", gap: "5px", flexWrap: "wrap" }}>
            <button
              onClick={() => {
                if (isMergeSuggestion) {
                  setShowAliasPicker(true);
                  return;
                }
                handlers.handleConfirm(suggestion.id);
              }}
              disabled={isPending}
              style={{
                display: "flex", alignItems: "center", gap: "3px",
                padding: "4px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 700,
                background: "var(--sw-accent-bg)", border: "1px solid var(--sw-accent-border)",
                color: "var(--sw-accent)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
                opacity: isPending ? 0.5 : 1,
              }}
            >
              <Check size={10} /> {
                isRelationSuggestion
                  ? "관계 후보 승인"
                  : isMergeSuggestion
                    ? "저장 대상 확인"
                    : "작가 승인으로 기억"
              }
            </button>
            {!isRelationSuggestion && !isMergeSuggestion && (
              <button
                onClick={() => setShowAliasPicker((prev) => !prev)}
                disabled={isPending || aliasableTargets.length === 0}
                style={{
                  display: "flex", alignItems: "center", gap: "3px",
                  padding: "4px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 600,
                  background: "var(--sw-bg-raised)", border: "1px solid var(--sw-border-default)",
                  color: aliasableTargets.length > 0 ? "var(--sw-accent)" : "var(--sw-text-ghost)",
                  cursor: aliasableTargets.length > 0 ? "pointer" : "default",
                  fontFamily: "var(--sw-font-sans)",
                  opacity: isPending ? 0.5 : 1,
                }}
              >
                별칭/호칭
              </button>
            )}
            {!isRelationSuggestion && (
              <button
                onClick={() => handlers.startEdit(suggestion)}
                disabled={isPending}
                style={{
                  display: "flex", alignItems: "center", gap: "3px",
                  padding: "4px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 600,
                  background: "var(--sw-bg-overlay)", border: "1px solid var(--sw-border-default)",
                  color: "var(--sw-text-dim)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
                  opacity: isPending ? 0.5 : 1,
                }}
              >
                <Pencil size={10} /> 수정 후 승인
              </button>
            )}
            <button
              onClick={() => handlers.handleDismiss(suggestion.id)}
              disabled={isPending}
              style={{
                display: "flex", alignItems: "center", gap: "3px",
                padding: "4px 8px", borderRadius: "5px", fontSize: "11px",
                background: "transparent", border: "1px solid transparent",
                color: "var(--sw-text-ghost)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
                opacity: isPending ? 0.5 : 1,
              }}
            >
              <X size={10} /> 이번에는 넘기기
            </button>
            {!isRelationSuggestion && (
              <button
                onClick={() => handlers.handleExclude(suggestion.id, suggestion.name)}
                disabled={isPending}
                style={{
                  display: "flex", alignItems: "center", gap: "3px",
                  padding: "4px 8px", borderRadius: "5px", fontSize: "11px",
                  background: "transparent", border: "1px solid var(--sw-border-subtle)",
                  color: "var(--sw-text-ghost)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
                  opacity: isPending ? 0.5 : 0.8,
                }}
              >
                앞으로 제외
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
