"use client";

import { useState } from "react";
import { Check, CheckCheck, RefreshCw, X } from "lucide-react";
import { ConfirmFactsBatchModal } from "./confirm-facts-batch-modal";

export interface FactSuggestionView {
  id: string;
  chapterNum: number | null;
  chapterTitle: string | null;
  entityName: string | null;
  entitySuggestionId: string | null;
  entitySuggestionName: string | null;
  factType: string;
  factKey: string | null;
  value: string;
  evidenceText: string | null;
  confidence: number;
  canApprove: boolean;
  existingFactId: string | null;
  existingSourceCount: number;
  conflictingFactId: string | null;
  conflictingValue: string | null;
  approvalMode: "CREATE_FACT" | "ADD_SOURCE" | "WAIT_FOR_ENTITY";
}

const FACT_TYPE_LABELS: Record<string, string> = {
  ATTRIBUTE: "속성",
  ROLE: "역할",
  AFFILIATION: "소속",
  ABILITY: "능력",
  STATE: "상태",
  LOCATION_INFO: "장소",
  RULE: "규칙",
  DESCRIPTION_TEXT: "묘사",
};

const APPROVAL_MODE_LABELS: Record<FactSuggestionView["approvalMode"], string> = {
  CREATE_FACT: "새 설정 후보",
  ADD_SOURCE: "근거 추가 후보",
  WAIT_FOR_ENTITY: "항목 승인 대기",
};

export function FactSuggestionList({
  suggestions,
  isPending,
  onConfirm,
  onConfirmBatch,
  onSupersede,
  onDismiss,
  onLocateEntitySuggestion,
}: {
  suggestions: FactSuggestionView[];
  isPending: boolean;
  onConfirm: (suggestionId: string) => void;
  onConfirmBatch: (suggestionIds: string[]) => void;
  onSupersede: (suggestionId: string, conflictingFactId: string) => void;
  onDismiss: (suggestionId: string) => void;
  onLocateEntitySuggestion?: (suggestionId: string) => void;
}) {
  const [showBatchModal, setShowBatchModal] = useState(false);

  if (suggestions.length === 0) return null;

  const batchApprovableIds = suggestions
    .filter((suggestion) => suggestion.canApprove && !suggestion.conflictingFactId)
    .map((suggestion) => suggestion.id);

  return (
    <>
      {showBatchModal && (
        <ConfirmFactsBatchModal
          count={batchApprovableIds.length}
          onClose={() => setShowBatchModal(false)}
          onConfirm={() => {
            setShowBatchModal(false);
            onConfirmBatch(batchApprovableIds);
          }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", paddingTop: "6px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--sw-text-ghost)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          검토할 세부 설정 ({suggestions.length})
        </div>
        {batchApprovableIds.length >= 2 && (
          <button
            type="button"
            onClick={() => setShowBatchModal(true)}
            disabled={isPending}
            className="inline-flex h-6 items-center justify-center gap-1 rounded px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-45"
            style={{
              background: "rgba(68, 138, 102, 0.14)",
              color: "var(--sw-success)",
              fontSize: "10px",
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            <CheckCheck className="size-3" />
            <span>설정 {batchApprovableIds.length}개 모두 저장</span>
          </button>
        )}
      </div>
      <p style={{ fontSize: "10px", color: "var(--sw-text-ghost)", margin: "-4px 0 2px", opacity: 0.75 }}>
        승인하면 출처가 연결된 설정으로 저장됩니다. 항목 후보에 붙은 설정은 먼저 작품 기억으로 승인해야 저장할 수 있습니다.
      </p>

      {suggestions.map((suggestion) => {
        const targetName = suggestion.entityName ?? suggestion.entitySuggestionName ?? "연결 항목 없음";
        const targetKindLabel = suggestion.entityName
          ? "작품 기억"
          : suggestion.entitySuggestionName
            ? "항목 후보"
            : "연결 없음";
        const chapterLabel = suggestion.chapterNum
          ? `${suggestion.chapterNum}화${suggestion.chapterTitle ? ` · ${suggestion.chapterTitle}` : ""}`
          : "회차 정보 없음";
        const approveLabel = suggestion.canApprove
          ? suggestion.approvalMode === "ADD_SOURCE"
            ? "기존 설정에 근거 추가"
            : suggestion.conflictingFactId
              ? "새 설정으로 따로 저장"
            : "설정으로 저장"
          : "먼저 항목 후보를 작품 기억으로 승인해야 합니다";
        const canSupersede =
          suggestion.canApprove &&
          suggestion.approvalMode === "CREATE_FACT" &&
          !!suggestion.conflictingFactId;
        const waitForEntityMessage = suggestion.entitySuggestionName
          ? `"${suggestion.entitySuggestionName}" 항목 후보를 먼저 작품 기억으로 승인하면 이 설정을 저장할 수 있습니다.`
          : "연결할 작품 기억 항목을 찾지 못했습니다. 관련 항목 후보가 있는지 확인하거나 이번 후보를 넘기세요.";

        return (
          <div
            key={suggestion.id}
            className="sw-glass"
            style={{
              borderRadius: "8px",
              border: "1px solid var(--sw-border-default)",
              padding: "10px",
              display: "flex",
              flexDirection: "column",
              gap: "8px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", minWidth: 0 }}>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  color: "var(--sw-text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {targetName}
              </span>
              <span
                style={{
                  border: "1px solid var(--sw-border-subtle)",
                  borderRadius: "999px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  color: suggestion.canApprove ? "var(--sw-success)" : "var(--sw-text-ghost)",
                  whiteSpace: "nowrap",
                }}
              >
                {targetKindLabel}
              </span>
              <span
                style={{
                  border: "1px solid var(--sw-border-default)",
                  borderRadius: "999px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  color: "var(--sw-text-muted)",
                  whiteSpace: "nowrap",
                }}
              >
                {FACT_TYPE_LABELS[suggestion.factType] ?? suggestion.factType}
              </span>
              <span
                style={{
                  border: "1px solid var(--sw-border-default)",
                  borderRadius: "999px",
                  padding: "2px 6px",
                  fontSize: "10px",
                  color:
                    suggestion.approvalMode === "WAIT_FOR_ENTITY"
                      ? "var(--sw-text-ghost)"
                      : suggestion.approvalMode === "ADD_SOURCE"
                        ? "var(--sw-success)"
                        : "var(--sw-warning)",
                  whiteSpace: "nowrap",
                }}
              >
                {APPROVAL_MODE_LABELS[suggestion.approvalMode]}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10px",
                  color: "var(--sw-text-ghost)",
                }}
              >
                {Math.round(suggestion.confidence * 100)}%
              </span>
            </div>

            <div style={{ fontSize: "12px", lineHeight: 1.5, color: "var(--sw-text-secondary)" }}>
              {suggestion.factKey && (
                <span style={{ color: "var(--sw-text-muted)" }}>{suggestion.factKey}: </span>
              )}
              {suggestion.value}
            </div>

            {suggestion.evidenceText && (
              <blockquote
                style={{
                  borderLeft: "2px solid var(--sw-border-hover)",
                  paddingLeft: "8px",
                  color: "var(--sw-text-muted)",
                  fontSize: "11px",
                  lineHeight: 1.45,
                }}
              >
                {suggestion.evidenceText}
              </blockquote>
            )}

            {suggestion.approvalMode === "ADD_SOURCE" && (
              <div
                style={{
                  border: "1px solid rgba(68, 138, 102, 0.22)",
                  borderRadius: "6px",
                  padding: "6px 8px",
                  background: "rgba(68, 138, 102, 0.08)",
                  color: "var(--sw-success)",
                  fontSize: "10px",
                  lineHeight: 1.45,
                }}
              >
                같은 설정이 이미 작품 기억에 있습니다. 승인하면 새 설정을 만들지 않고 원문 근거
                {suggestion.existingSourceCount > 0
                  ? ` ${suggestion.existingSourceCount + 1}번째`
                  : ""}로 추가됩니다.
              </div>
            )}

            {suggestion.approvalMode === "WAIT_FOR_ENTITY" && (
              <div
                style={{
                  border: "1px solid rgba(182, 134, 42, 0.22)",
                  borderRadius: "6px",
                  padding: "6px 8px",
                  background: "rgba(182, 134, 42, 0.08)",
                  color: "var(--sw-warning)",
                  fontSize: "10px",
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ display: "block", marginBottom: "2px", color: "var(--sw-warning)" }}>
                  항목 연결이 먼저 필요합니다
                </strong>
                {waitForEntityMessage}
                {suggestion.entitySuggestionId && onLocateEntitySuggestion && (
                  <button
                    type="button"
                    onClick={() => onLocateEntitySuggestion(suggestion.entitySuggestionId!)}
                    disabled={isPending}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      marginTop: "6px",
                      borderRadius: "5px",
                      border: "1px solid rgba(182, 134, 42, 0.24)",
                      background: "rgba(182, 134, 42, 0.08)",
                      color: "var(--sw-warning)",
                      padding: "4px 7px",
                      fontSize: "10px",
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "var(--sw-font-sans)",
                      opacity: isPending ? 0.5 : 1,
                    }}
                  >
                    관련 항목 후보 보기
                  </button>
                )}
              </div>
            )}

            {suggestion.approvalMode === "CREATE_FACT" && suggestion.conflictingFactId && (
              <div
                style={{
                  border: "1px solid rgba(214, 162, 67, 0.26)",
                  borderRadius: "6px",
                  padding: "6px 8px",
                  background: "rgba(214, 162, 67, 0.08)",
                  color: "var(--sw-warning)",
                  fontSize: "10px",
                  lineHeight: 1.45,
                }}
              >
                기존 승인 설정과 값이 다릅니다. 체크 버튼은 새 설정으로 따로 저장하고, 회전 버튼은 기존 설정을 이 설정으로 대체합니다.
                {suggestion.conflictingValue && (
                  <span style={{ display: "block", marginTop: "4px", color: "var(--sw-text-muted)" }}>
                    기존: {suggestion.conflictingValue} · 새 후보: {suggestion.value}
                  </span>
                )}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontSize: "10px", color: "var(--sw-text-ghost)", flex: 1 }}>
                {chapterLabel}
                {!suggestion.canApprove && " · 항목 승인 후 저장 가능"}
              </span>
              <button
                type="button"
                onClick={() => onConfirm(suggestion.id)}
                disabled={isPending || !suggestion.canApprove}
                className="inline-flex h-7 items-center justify-center gap-1 rounded px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                  background: "rgba(68, 138, 102, 0.14)",
                  color: "var(--sw-success)",
                  fontSize: "10px",
                  fontWeight: 700,
                }}
                title={approveLabel}
                aria-label={approveLabel}
              >
                <Check className="size-3.5" />
                <span>
                  {suggestion.canApprove
                    ? suggestion.approvalMode === "ADD_SOURCE"
                      ? "근거 추가"
                      : suggestion.conflictingFactId
                        ? "따로 저장"
                        : "저장"
                    : "대기"}
                </span>
              </button>
              {canSupersede && (
                <button
                  type="button"
                  onClick={() => onSupersede(suggestion.id, suggestion.conflictingFactId!)}
                  disabled={isPending}
                  className="inline-flex h-7 items-center justify-center gap-1 rounded px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                  style={{
                    background: "rgba(214, 162, 67, 0.14)",
                    color: "var(--sw-warning)",
                    fontSize: "10px",
                    fontWeight: 700,
                  }}
                  title="기존 설정을 이 설정으로 대체"
                  aria-label="기존 설정을 이 설정으로 대체"
                >
                  <RefreshCw className="size-3.5" />
                  <span>대체</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismiss(suggestion.id)}
                disabled={isPending}
                className="inline-flex h-7 items-center justify-center gap-1 rounded px-2 transition-colors disabled:cursor-not-allowed disabled:opacity-45"
                style={{ color: "var(--sw-text-muted)", fontSize: "10px", fontWeight: 600 }}
                title="이번 설정 후보 넘기기"
                aria-label="이번 설정 후보 넘기기"
              >
                <X className="size-3.5" />
                <span>넘김</span>
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
