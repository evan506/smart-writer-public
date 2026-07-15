"use client";

import { type Dispatch, type SetStateAction, type TransitionStartFunction } from "react";
import {
  getSuggestions,
  confirmSuggestion,
  confirmSuggestionAsAlias,
  rejectSuggestionAliasTarget,
  confirmAllSuggestions,
  dismissSuggestion,
  dismissSuggestionAndExclude,
  dismissAllSuggestions,
} from "@/app/(dashboard)/projects/[id]/suggestion-actions";
import { toast } from "sonner";
import type { EntitySuggestion, EntityType } from "@/types";

export function useEntitySuggestionHandlers({
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
}: {
  projectId: string;
  suggestions: EntitySuggestion[];
  setSuggestions: Dispatch<SetStateAction<EntitySuggestion[]>>;
  setCount: Dispatch<SetStateAction<number>>;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  setShowConfirmAllModal: Dispatch<SetStateAction<boolean>>;
  refreshAliasTargets: () => Promise<void>;
  refreshFactSuggestions: () => Promise<number>;
  startTransition: TransitionStartFunction;
  onMemoryChange?: () => void;
}) {
  function handleConfirm(
    suggestionId: string,
    overrides?: { name?: string; type?: EntityType; summary?: string; aliases?: string[] }
  ) {
    startTransition(async () => {
      const result = await confirmSuggestion(suggestionId, projectId, overrides);
      if (result.error) {
        if (result.error.includes("먼저 해당 작품 기억 항목을 저장하세요")) {
          toast.error(result.error, { duration: 5000 });
        } else {
          toast.error(result.error);
        }
      } else {
        toast.success("작품 기억에 저장했습니다");
        setSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== suggestionId));
        setCount((prev) => prev - 1);
        setEditingId(null);
        refreshAliasTargets();
        refreshFactSuggestions();
        onMemoryChange?.();
      }
    });
  }

  function handleConfirmAsAlias(suggestionId: string, targetEntityId: string) {
    startTransition(async () => {
      const result = await confirmSuggestionAsAlias(suggestionId, projectId, targetEntityId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`${result.targetName}의 별칭/호칭으로 저장했습니다`);
        setSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== suggestionId));
        setCount((prev) => prev - 1);
        refreshAliasTargets();
        refreshFactSuggestions();
        onMemoryChange?.();
      }
    });
  }

  function handleRejectAliasTarget(suggestionId: string) {
    startTransition(async () => {
      const result = await rejectSuggestionAliasTarget(suggestionId, projectId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setSuggestions((prev) => prev.map((suggestion) => (
          suggestion.id === suggestionId
            ? { ...suggestion, matched_entity_id: null }
            : suggestion
        )));
        toast.success("저장 대상 선택을 해제했습니다");
      }
    });
  }

  function handleDismiss(suggestionId: string) {
    startTransition(async () => {
      const result = await dismissSuggestion(suggestionId, projectId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== suggestionId));
        setCount((prev) => prev - 1);
        toast.success("이번 후보를 넘겼습니다");
      }
    });
  }

  function handleExclude(suggestionId: string, suggestionName: string) {
    const confirmed = window.confirm(
      `"${suggestionName}"은 앞으로 확인 후보에서 제외합니다. 이번 후보만 넘기려면 취소를 누르세요.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await dismissSuggestionAndExclude(suggestionId, projectId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== suggestionId));
        setCount((prev) => prev - 1);
        toast.success("앞으로 후보에서 제외합니다");
      }
    });
  }

  function handleConfirmAll() {
    const mergeOnly = suggestions.length > 0 && suggestions.every((suggestion) => suggestion.suggested_action === "MERGE");
    if (mergeOnly) {
      toast.info("별칭/호칭 후보는 대상을 확인한 뒤 저장해 주세요.");
      return;
    }
    setShowConfirmAllModal(true);
  }

  function executeConfirmAll() {
    setShowConfirmAllModal(false);
    startTransition(async () => {
      const result = await confirmAllSuggestions(projectId);
      if (result.error) {
        toast.error(result.error);
      } else {
        const confirmed = result.confirmed ?? 0;
        const skippedMerge = result.skippedMerge ?? 0;
        if (confirmed > 0 && skippedMerge > 0) {
          toast.success(`${confirmed}개 항목을 기억했습니다. 별칭/호칭 후보 ${skippedMerge}개는 직접 확인해 주세요.`);
        } else if (skippedMerge > 0) {
          toast.info(`별칭/호칭 후보 ${skippedMerge}개는 직접 확인해 주세요.`);
        } else {
          toast.success(`${confirmed}개 항목을 작품 기억에 저장했습니다`);
        }
        const refreshed = await getSuggestions(projectId);
        if (!refreshed.error) {
          setSuggestions(refreshed.suggestions);
          setCount(refreshed.suggestions.length);
        }
        refreshAliasTargets();
        refreshFactSuggestions();
        onMemoryChange?.();
      }
    });
  }

  function handleDismissAll() {
    startTransition(async () => {
      const result = await dismissAllSuggestions(projectId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setSuggestions([]);
        setCount(0);
      }
    });
  }

  return {
    handleConfirm,
    handleConfirmAsAlias,
    handleRejectAliasTarget,
    handleDismiss,
    handleExclude,
    handleConfirmAll,
    executeConfirmAll,
    handleDismissAll,
  };
}
