"use client";

import { ChevronDown } from "lucide-react";
import type { EntitySuggestion } from "@/types";
import { inputStyle, TYPE_LABELS } from "./constants";
import type { AliasTarget } from "./types";

export function AliasControls({
  suggestion,
  aliasableTargets,
  selectedAliasTarget,
  aliasTargetId,
  isMergeSuggestion,
  isPending,
  setAliasTargetId,
  setShowAliasPicker,
  handleConfirmAsAlias,
  handleRejectAliasTarget,
}: {
  suggestion: EntitySuggestion;
  aliasableTargets: AliasTarget[];
  selectedAliasTarget: AliasTarget | undefined;
  aliasTargetId: string;
  isMergeSuggestion: boolean;
  isPending: boolean;
  setAliasTargetId: (targetId: string) => void;
  setShowAliasPicker: (show: boolean) => void;
  handleConfirmAsAlias: (suggestionId: string, targetEntityId: string) => void;
  handleRejectAliasTarget: (suggestionId: string) => void;
}) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      padding: "8px",
      borderRadius: "6px",
      background: "var(--sw-bg-raised)",
      border: "1px solid var(--sw-border-muted)",
    }}>
      <p style={{ fontSize: "10.5px", color: "var(--sw-text-ghost)", lineHeight: 1.5, margin: 0 }}>
        {isMergeSuggestion && suggestion.matched_entity_id
          ? "별칭 후보는 잘못 병합하면 canon이 오염될 수 있습니다. 저장할 대상이 맞을 때만 기존 항목의 별칭/호칭으로 승인하세요."
          : "이 표현을 기존 항목의 별칭/호칭 후보로 검토할 수 있습니다. 대상이 맞을 때만 승인하세요."}
      </p>
      {selectedAliasTarget && (
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "8px",
          padding: "6px 8px",
          borderRadius: "6px",
          background: "var(--sw-bg-active)",
          border: "1px solid var(--sw-border-focus)",
          fontSize: "10.5px",
        }}>
          <span style={{ color: "var(--sw-text-ghost)" }}>
            승인 대상
          </span>
          <strong style={{ color: "var(--sw-accent)", fontWeight: 700 }}>
            {selectedAliasTarget.name} · {TYPE_LABELS[selectedAliasTarget.type] ?? selectedAliasTarget.type}
          </strong>
        </div>
      )}
      {isMergeSuggestion && !aliasTargetId && (
        <div style={{
          padding: "7px 8px",
          borderRadius: "6px",
          background: "rgba(182, 134, 42, 0.1)",
          border: "1px solid rgba(182, 134, 42, 0.2)",
        }}>
          <p style={{ fontSize: "10.5px", color: "var(--sw-warning)", lineHeight: 1.5, margin: 0, fontWeight: 700 }}>
            저장할 대상을 선택해 주세요
          </p>
          <p style={{ fontSize: "10.5px", color: "var(--sw-text-ghost)", lineHeight: 1.5, margin: "3px 0 0" }}>
            다른 대상을 선택해 승인하거나, 이번만 넘기거나, 앞으로 제외할 수 있습니다.
          </p>
        </div>
      )}
      <div style={{ position: "relative" }}>
        <select
          value={aliasTargetId}
          onChange={(e) => setAliasTargetId(e.target.value)}
          style={{ ...inputStyle, appearance: "none", paddingRight: "28px", cursor: "pointer" }}
        >
          <option value="">항목 선택</option>
          {aliasableTargets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.name} · {TYPE_LABELS[target.type] ?? target.type}
            </option>
          ))}
        </select>
        <ChevronDown size={12} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--sw-text-dim)", pointerEvents: "none" }} />
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          onClick={() => aliasTargetId && handleConfirmAsAlias(suggestion.id, aliasTargetId)}
          disabled={isPending || !aliasTargetId}
          style={{
            flex: 1, padding: "6px", borderRadius: "6px", fontSize: "11px", fontWeight: 700,
            background: "var(--sw-bg-active)", border: "1px solid var(--sw-border-focus)",
            color: "var(--sw-accent)", cursor: aliasTargetId ? "pointer" : "default",
            fontFamily: "var(--sw-font-sans)", opacity: isPending || !aliasTargetId ? 0.5 : 1,
          }}
        >
          기존 항목 별칭으로 승인
        </button>
        {isMergeSuggestion && suggestion.matched_entity_id && (
          <button
            onClick={() => {
              setAliasTargetId("");
              handleRejectAliasTarget(suggestion.id);
            }}
            disabled={isPending}
            style={{
              padding: "6px 10px", borderRadius: "6px", fontSize: "11px",
              background: "rgba(182, 134, 42, 0.1)", border: "1px solid rgba(182, 134, 42, 0.2)",
              color: "var(--sw-warning)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
              opacity: isPending ? 0.5 : 1,
            }}
          >
            다른 대상 선택
          </button>
        )}
        <button
          onClick={() => {
            setShowAliasPicker(false);
            setAliasTargetId("");
          }}
          style={{
            padding: "6px 10px", borderRadius: "6px", fontSize: "11px",
            background: "var(--sw-bg-overlay)", border: "1px solid var(--sw-border-muted)",
            color: "var(--sw-text-dim)", cursor: "pointer", fontFamily: "var(--sw-font-sans)",
          }}
        >
          취소
        </button>
      </div>
    </div>
  );
}
