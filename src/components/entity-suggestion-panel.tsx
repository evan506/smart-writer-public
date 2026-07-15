"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  getSuggestionAliasTargets,
  getSuggestions,
  getFactSuggestions,
} from "@/app/(dashboard)/projects/[id]/suggestion-actions";
import type { EntitySuggestion, EntityType } from "@/types";
import { BatchToolbar } from "./entity-suggestion-panel/batch-toolbar";
import { ConfirmAllModal } from "./entity-suggestion-panel/confirm-all-modal";
import { ResultSummary } from "./entity-suggestion-panel/result-summary";
import {
  AnalysisFailedState,
  AnalyzingState,
  EmptyState,
  LoadingState,
} from "./entity-suggestion-panel/status-states";
import { SuggestionList } from "./entity-suggestion-panel/suggestion-list";
import { UsageGuide } from "./entity-suggestion-panel/usage-guide";
import { FactSuggestionList, type FactSuggestionView } from "./entity-suggestion-panel/fact-suggestion-list";
import type { AliasTarget, EditForm, SuggestionHandlers } from "./entity-suggestion-panel/types";
import { useSuggestionPolling } from "./entity-suggestion-panel/use-suggestion-polling";
import { useFactSuggestionHandlers } from "./entity-suggestion-panel/use-fact-suggestion-handlers";
import { useEntitySuggestionHandlers } from "./entity-suggestion-panel/use-entity-suggestion-handlers";
import { useSuggestionLocate } from "./entity-suggestion-panel/use-suggestion-locate";

export function EntitySuggestionPanel({
  projectId,
  chapterId,
  saveSignal,
  onPendingCountChange,
  onAnalyzingChange,
  onMemoryChange,
}: {
  projectId: string;
  chapterId?: string | null;
  saveSignal: number;
  onPendingCountChange?: (count: number) => void;
  onAnalyzingChange?: (analyzing: boolean) => void;
  onMemoryChange?: () => void;
}) {
  const [count, setCount] = useState(0);
  const [suggestions, setSuggestions] = useState<EntitySuggestion[]>([]);
  const [factSuggestions, setFactSuggestions] = useState<FactSuggestionView[]>([]);
  const factCountRef = useRef(0);
  const [aliasTargets, setAliasTargets] = useState<AliasTarget[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    type: "CHARACTER",
    summary: "",
    aliases: "",
  });
  const [isPending, startTransition] = useTransition();
  const [showConfirmAllModal, setShowConfirmAllModal] = useState(false);
  const [guideDismissed, setGuideDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("sw-suggestion-guide-dismissed") === "1";
  });

  const dismissGuide = () => {
    setGuideDismissed(true);
    localStorage.setItem("sw-suggestion-guide-dismissed", "1");
  };

  const refreshAliasTargets = useCallback(async () => {
    const result = await getSuggestionAliasTargets(projectId);
    if (!result.error) {
      setAliasTargets(result.entities);
    }
  }, [projectId]);

  const refreshFactSuggestions = useCallback(async () => {
    const previousCount = factCountRef.current;
    const result = await getFactSuggestions(projectId);
    if (result.error) return 0;

    setFactSuggestions(result.suggestions);
    factCountRef.current = result.suggestions.length;
    return Math.max(0, result.suggestions.length - previousCount);
  }, [projectId]);

  useEffect(() => {
    onPendingCountChange?.(count + factSuggestions.length);
  }, [count, factSuggestions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      getSuggestions(projectId),
      getSuggestionAliasTargets(projectId),
      getFactSuggestions(projectId),
    ]).then(([result, targetResult, factResult]) => {
      if (cancelled) return;
      if (!result.error) {
        setSuggestions(result.suggestions);
        setCount(result.suggestions.length);
      }
      if (!targetResult.error) {
        setAliasTargets(targetResult.entities);
      }
      if (!factResult.error) {
        setFactSuggestions(factResult.suggestions);
        factCountRef.current = factResult.suggestions.length;
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const {
    analyzing,
    autoRegisteredEntityCount,
    autoRegisteredRelationCount,
    autoRegisteredNames,
    analysisCompletedWithoutResults,
    analysisFailed,
  } = useSuggestionPolling({
    projectId,
    chapterId,
    saveSignal,
    count,
    setCount,
    setSuggestions,
    refreshAliasTargets,
    refreshFactSuggestions,
    onAnalyzingChange,
  });

  const { highlightedSuggestionId, handleLocateEntitySuggestion } = useSuggestionLocate();

  const {
    handleConfirmFact,
    handleConfirmFactBatch,
    handleSupersedeFact,
    handleDismissFact,
  } = useFactSuggestionHandlers({
    projectId,
    setFactSuggestions,
    factCountRef,
    refreshFactSuggestions,
    startTransition,
    onMemoryChange,
  });

  const {
    handleConfirm,
    handleConfirmAsAlias,
    handleRejectAliasTarget,
    handleDismiss,
    handleExclude,
    handleConfirmAll,
    executeConfirmAll,
    handleDismissAll,
  } = useEntitySuggestionHandlers({
    projectId,
    suggestions,
    setSuggestions,
    setCount,
    setEditingId,
    setShowConfirmAllModal,
    refreshAliasTargets,
    refreshFactSuggestions,
    startTransition,
    onMemoryChange,
  });

  function startEdit(suggestion: EntitySuggestion) {
    setEditingId(suggestion.id);
    setEditForm({
      name: suggestion.name,
      type: suggestion.type as EntityType,
      summary: suggestion.summary ?? "",
      aliases: Array.isArray(suggestion.aliases) ? (suggestion.aliases as string[]).join(", ") : "",
    });
  }

  if (analysisFailed && suggestions.length === 0 && factSuggestions.length === 0) {
    return <AnalysisFailedState />;
  }

  if (analyzing && suggestions.length === 0 && factSuggestions.length === 0) {
    return <AnalyzingState />;
  }

  if (loading) {
    return <LoadingState />;
  }

  if (suggestions.length === 0 && factSuggestions.length === 0) {
    return (
      <EmptyState
        autoRegisteredEntityCount={autoRegisteredEntityCount}
        autoRegisteredRelationCount={autoRegisteredRelationCount}
        autoRegisteredNames={autoRegisteredNames}
        analysisCompletedWithoutResults={analysisCompletedWithoutResults}
      />
    );
  }

  const entitySuggestions = suggestions.filter((suggestion) => suggestion.type !== "RELATION");
  const relationSuggestions = suggestions.filter((suggestion) => suggestion.type === "RELATION");
  const mergeSuggestionCount = entitySuggestions.filter((suggestion) => suggestion.suggested_action === "MERGE").length;
  const confirmableEntityCount = entitySuggestions.length - mergeSuggestionCount;
  const confirmAllCount = confirmableEntityCount + relationSuggestions.length;
  const handlers: SuggestionHandlers = {
    startEdit,
    handleConfirm,
    handleConfirmAsAlias,
    handleRejectAliasTarget,
    handleDismiss,
    handleExclude,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {showConfirmAllModal && (
        <ConfirmAllModal
          confirmAllCount={confirmAllCount}
          confirmableEntityCount={confirmableEntityCount}
          relationSuggestionCount={relationSuggestions.length}
          mergeSuggestionCount={mergeSuggestionCount}
          onClose={() => setShowConfirmAllModal(false)}
          onConfirm={executeConfirmAll}
        />
      )}

      {!guideDismissed && <UsageGuide onDismiss={dismissGuide} />}

      {suggestions.length > 0 && (
        <>
          <ResultSummary
            entitySuggestionCount={entitySuggestions.length}
            relationSuggestionCount={relationSuggestions.length}
          />

          <BatchToolbar
            isPending={isPending}
            onConfirmAll={handleConfirmAll}
            onDismissAll={handleDismissAll}
          />
        </>
      )}

      <SuggestionList
        entitySuggestions={entitySuggestions}
        relationSuggestions={relationSuggestions}
        aliasTargets={aliasTargets}
        editingId={editingId}
        editForm={editForm}
        setEditForm={setEditForm}
        isPending={isPending}
        highlightedSuggestionId={highlightedSuggestionId}
        setEditingId={setEditingId}
        handlers={handlers}
      />

      <FactSuggestionList
        suggestions={factSuggestions}
        isPending={isPending}
        onConfirm={handleConfirmFact}
        onConfirmBatch={handleConfirmFactBatch}
        onSupersede={handleSupersedeFact}
        onDismiss={handleDismissFact}
        onLocateEntitySuggestion={handleLocateEntitySuggestion}
      />
    </div>
  );
}
