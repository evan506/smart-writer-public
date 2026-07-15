"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  getExtractionSummary,
  getSuggestionCount,
  getSuggestions,
} from "@/app/(dashboard)/projects/[id]/suggestion-actions";
import { getLatestAnalysisJob } from "@/app/(dashboard)/projects/[id]/analysis-actions";
import { toast } from "sonner";
import type { EntitySuggestion } from "@/types";
import { POLL_INTERVAL, POLL_MAX_DURATION } from "./constants";

export function useSuggestionPolling({
  projectId,
  chapterId,
  saveSignal,
  count,
  setCount,
  setSuggestions,
  refreshAliasTargets,
  refreshFactSuggestions,
  onAnalyzingChange,
}: {
  projectId: string;
  chapterId?: string | null;
  saveSignal: number;
  count: number;
  setCount: Dispatch<SetStateAction<number>>;
  setSuggestions: Dispatch<SetStateAction<EntitySuggestion[]>>;
  refreshAliasTargets: () => Promise<void>;
  refreshFactSuggestions: () => Promise<number>;
  onAnalyzingChange?: (analyzing: boolean) => void;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [autoRegisteredEntityCount, setAutoRegisteredEntityCount] = useState(0);
  const [autoRegisteredRelationCount, setAutoRegisteredRelationCount] = useState(0);
  const [autoRegisteredNames, setAutoRegisteredNames] = useState<string[]>([]);
  const [analysisCompletedWithoutResults, setAnalysisCompletedWithoutResults] = useState(false);
  const [analysisFailed, setAnalysisFailed] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const prevCountRef = useRef<number>(0);
  const extractionStartedAtRef = useRef<string>("");
  const interimToastShownRef = useRef(false);
  const interimSnapshotRef = useRef("");

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setAnalyzing(false);
    onAnalyzingChange?.(false);
  }, [onAnalyzingChange]);

  useEffect(() => {
    if (saveSignal === 0) return;

    setAnalyzing(true);
    onAnalyzingChange?.(true);
    setAutoRegisteredEntityCount(0);
    setAutoRegisteredRelationCount(0);
    setAutoRegisteredNames([]);
    setAnalysisCompletedWithoutResults(false);
    setAnalysisFailed(false);
    interimToastShownRef.current = false;
    interimSnapshotRef.current = "";
    prevCountRef.current = count;
    extractionStartedAtRef.current = new Date().toISOString();
    pollStartRef.current = Date.now();

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      const elapsed = Date.now() - pollStartRef.current;
      if (elapsed > POLL_MAX_DURATION) {
        setAnalysisCompletedWithoutResults(true);
        stopPolling();
        return;
      }

      if (chapterId) {
        const { job } = await getLatestAnalysisJob(projectId, chapterId);
        if (job?.status === "FAILED") {
          stopPolling();
          setAnalysisFailed(true);
          toast.error("기억 후보 찾기에 실패했습니다. 다시 저장해 주세요.");
          return;
        }
        if (job?.status === "DONE") {
          stopPolling();
          const result = await getSuggestions(projectId);
          if (!result.error) {
            setSuggestions(result.suggestions);
            setCount(result.suggestions.length);
            const found = result.suggestions.length - prevCountRef.current;
            const factFound = await refreshFactSuggestions();
            const totalFound = found + factFound;
            if (totalFound > 0) {
              toast.success(`확인할 기억 ${totalFound}개를 찾았습니다`);
            }
          }
          refreshAliasTargets();
          return;
        }
      }

      const newCount = await getSuggestionCount(projectId);
      if (chapterId) {
        // Job-tracked path: only DONE/FAILED/timeout may end polling.
        // Auto-confirms land before relation/fact suggestions are written,
        // so stopping on the first interim signal froze the panel on a
        // partial snapshot (facts never appeared until a manual reload).
        const summary = await getExtractionSummary(
          projectId,
          chapterId,
          extractionStartedAtRef.current
        );
        if (!summary.error) {
          setAutoRegisteredEntityCount(summary.autoConfirmedEntityCount);
          setAutoRegisteredRelationCount(summary.autoConfirmedRelationCount);
          setAutoRegisteredNames(summary.confirmedNames);

          const snapshot = [
            summary.autoConfirmedEntityCount,
            summary.autoConfirmedRelationCount,
            summary.pendingCount,
          ].join("|");
          const hasInterimResults =
            summary.autoConfirmedEntityCount > 0 ||
            summary.autoConfirmedRelationCount > 0 ||
            summary.pendingCount > 0;

          if (hasInterimResults && snapshot !== interimSnapshotRef.current) {
            interimSnapshotRef.current = snapshot;
            // Progressive refresh while the job keeps running.
            const result = await getSuggestions(projectId);
            if (!result.error) {
              setSuggestions(result.suggestions);
              setCount(result.suggestions.length);
            }
            await refreshFactSuggestions();
            refreshAliasTargets();
            if (
              summary.autoConfirmedEntityCount > 0 &&
              !interimToastShownRef.current
            ) {
              interimToastShownRef.current = true;
              toast.success(
                `${summary.autoConfirmedEntityCount}개의 설정을 작품 기억에 저장했습니다`
              );
            }
          }
        }
        return;
      }

      // Fallback without job tracking: stop on the first count increase.
      if (newCount > prevCountRef.current) {
        setCount(newCount);
        stopPolling();
        const result = await getSuggestions(projectId);
        if (!result.error) setSuggestions(result.suggestions);
        await refreshFactSuggestions();
        refreshAliasTargets();
        toast.success(`확인할 기억 ${newCount - prevCountRef.current}개를 찾았습니다`);
        return;
      }
      setCount(newCount);
    }, POLL_INTERVAL);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      onAnalyzingChange?.(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveSignal]);

  return {
    analyzing,
    autoRegisteredEntityCount,
    autoRegisteredRelationCount,
    autoRegisteredNames,
    analysisCompletedWithoutResults,
    analysisFailed,
  };
}
