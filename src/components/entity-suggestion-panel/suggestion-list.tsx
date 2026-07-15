"use client";

import type { Dispatch, SetStateAction } from "react";
import type { EntitySuggestion } from "@/types";
import { SuggestionCard } from "./suggestion-card";
import type { AliasTarget, EditForm, SuggestionHandlers } from "./types";

export function SuggestionList({
  entitySuggestions,
  relationSuggestions,
  aliasTargets,
  editingId,
  editForm,
  setEditForm,
  isPending,
  highlightedSuggestionId,
  setEditingId,
  handlers,
}: {
  entitySuggestions: EntitySuggestion[];
  relationSuggestions: EntitySuggestion[];
  aliasTargets: AliasTarget[];
  editingId: string | null;
  editForm: EditForm;
  setEditForm: Dispatch<SetStateAction<EditForm>>;
  isPending: boolean;
  highlightedSuggestionId: string | null;
  setEditingId: (id: string | null) => void;
  handlers: SuggestionHandlers;
}) {
  return (
    <>
      {entitySuggestions.length > 0 && (
        <>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--sw-text-ghost)", letterSpacing: "0.08em", textTransform: "uppercase", paddingTop: "2px" }}>
            검토할 설정 후보 ({entitySuggestions.length})
          </div>
          {entitySuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              aliasTargets={aliasTargets}
              editingId={editingId}
              editForm={editForm}
              setEditForm={setEditForm}
              isPending={isPending}
              isHighlighted={suggestion.id === highlightedSuggestionId}
              setEditingId={setEditingId}
              handlers={handlers}
            />
          ))}
        </>
      )}

      {relationSuggestions.length > 0 && (
        <>
          <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--sw-text-ghost)", letterSpacing: "0.08em", textTransform: "uppercase", paddingTop: entitySuggestions.length > 0 ? "6px" : "2px" }}>
            검토할 관계 후보 ({relationSuggestions.length})
          </div>
          {entitySuggestions.length > 0 && (
            <p style={{ fontSize: "10px", color: "var(--sw-text-ghost)", margin: "-4px 0 2px", opacity: 0.7 }}>
              관계 후보는 승인 전까지 확정 canon/그래프에 반영되지 않습니다
            </p>
          )}
          {relationSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              aliasTargets={aliasTargets}
              editingId={editingId}
              editForm={editForm}
              setEditForm={setEditForm}
              isPending={isPending}
              isHighlighted={suggestion.id === highlightedSuggestionId}
              setEditingId={setEditingId}
              handlers={handlers}
            />
          ))}
        </>
      )}
    </>
  );
}
