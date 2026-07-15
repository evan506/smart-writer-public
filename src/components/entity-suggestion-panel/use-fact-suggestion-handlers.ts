"use client";

import { type Dispatch, type SetStateAction, type TransitionStartFunction } from "react";
import {
  confirmFactSuggestion,
  confirmFactSuggestionBatch,
  supersedePendingFactSuggestion,
  dismissPendingFactSuggestion,
} from "@/app/(dashboard)/projects/[id]/suggestion-actions";
import { toast } from "sonner";
import type { FactSuggestionView } from "./fact-suggestion-list";

export function useFactSuggestionHandlers({
  projectId,
  setFactSuggestions,
  factCountRef,
  refreshFactSuggestions,
  startTransition,
  onMemoryChange,
}: {
  projectId: string;
  setFactSuggestions: Dispatch<SetStateAction<FactSuggestionView[]>>;
  factCountRef: { current: number };
  refreshFactSuggestions: () => Promise<number>;
  startTransition: TransitionStartFunction;
  onMemoryChange?: () => void;
}) {
  function handleConfirmFact(suggestionId: string) {
    startTransition(async () => {
      const result = await confirmFactSuggestion(suggestionId, projectId);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(
          result.mode === "source_added"
            ? "이미 승인된 설정에 새 근거를 추가했습니다"
            : "세부 설정을 작품 기억에 저장했습니다"
        );
        setFactSuggestions((prev) => {
          const next = prev.filter((suggestion) => suggestion.id !== suggestionId);
          factCountRef.current = next.length;
          return next;
        });
        onMemoryChange?.();
      }
    });
  }

  function handleConfirmFactBatch(suggestionIds: string[]) {
    startTransition(async () => {
      const result = await confirmFactSuggestionBatch(projectId, suggestionIds);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      const confirmedCount = result.confirmedCount;
      const skippedCount = result.skipped.length;
      if (confirmedCount > 0 && skippedCount > 0) {
        toast.success(`설정 ${confirmedCount}개를 저장했습니다. ${skippedCount}개는 직접 확인해 주세요.`);
      } else if (skippedCount > 0) {
        toast.error(`설정 ${skippedCount}개 저장에 실패했습니다. 직접 확인해 주세요.`);
      } else {
        toast.success(`설정 ${confirmedCount}개를 저장했습니다`);
      }

      await refreshFactSuggestions();
      onMemoryChange?.();
    });
  }

  function handleSupersedeFact(suggestionId: string, conflictingFactId: string) {
    const confirmed = window.confirm(
      "기존 승인 설정을 이 설정으로 대체합니다. 기존 설정과 근거는 기록으로 보존됩니다."
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await supersedePendingFactSuggestion(
        suggestionId,
        projectId,
        conflictingFactId
      );
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("기존 설정을 대체하고 새 설정을 승인했습니다");
        setFactSuggestions((prev) => {
          const next = prev.filter((suggestion) => suggestion.id !== suggestionId);
          factCountRef.current = next.length;
          return next;
        });
        onMemoryChange?.();
      }
    });
  }

  function handleDismissFact(suggestionId: string) {
    startTransition(async () => {
      const result = await dismissPendingFactSuggestion(suggestionId, projectId);
      if (result.error) {
        toast.error(result.error);
      } else {
        setFactSuggestions((prev) => {
          const next = prev.filter((suggestion) => suggestion.id !== suggestionId);
          factCountRef.current = next.length;
          return next;
        });
        toast.success("이번 세부 설정 후보를 넘겼습니다");
      }
    });
  }

  return {
    handleConfirmFact,
    handleConfirmFactBatch,
    handleSupersedeFact,
    handleDismissFact,
  };
}
