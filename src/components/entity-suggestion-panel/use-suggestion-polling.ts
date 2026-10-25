"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
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
  const [analysisDelayed, setAnalysisDelayed] = useState(false);
  const generationRef = useRef(0);
  const previousSaveSignalRef = useRef(0);
  const contextKey = `${projectId}:${chapterId ?? ""}`;
  const previousContextRef = useRef(contextKey);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef = useRef<number>(0);
  const prevCountRef = useRef<number>(0);
  const extractionStartedAtRef = useRef<string>("");
  const interimToastShownRef = useRef(false);
  const interimSnapshotRef = useRef("");

  const stopPolling = useEffectEvent(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setAnalyzing(false);
    onAnalyzingChange?.(false);
  });

  const beginPolling = useEffectEvent(() => {
    const generation = generationRef.current;
    const isCurrent = () => generation === generationRef.current;
    let checking = false;
    setAnalyzing(true);
    onAnalyzingChange?.(true);
    setAutoRegisteredEntityCount(0);
    setAutoRegisteredRelationCount(0);
    setAutoRegisteredNames([]);
    setAnalysisCompletedWithoutResults(false);
    setAnalysisFailed(false);
    setAnalysisDelayed(false);
    interimToastShownRef.current = false;
    interimSnapshotRef.current = "";
    prevCountRef.current = count;
    extractionStartedAtRef.current = new Date().toISOString();
    pollStartRef.current = Date.now();

    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    pollTimerRef.current = setInterval(async () => {
      if (!isCurrent()) return;
      const elapsed = Date.now() - pollStartRef.current;
      if (elapsed > POLL_MAX_DURATION) {
        ++generationRef.current;
        setAnalysisDelayed(true);
        stopPolling();
        return;
      }

      if (checking) return;
      checking = true;
      try {
        if (chapterId) {
          const { job } = await getLatestAnalysisJob(projectId, chapterId);
          if (!isCurrent()) return;
          if (job?.status === "FAILED") {
            stopPolling();
            setAnalysisFailed(true);
            await refreshResults(generation);
            if (!isCurrent()) return;
            toast.error("원고는 저장됐습니다. 기억 정리를 끝내지 못했습니다.");
            return;
          }
          if (job?.status === "DONE") {
            stopPolling();
            const refreshed = await refreshResults(generation);
            if (!isCurrent()) return;
            if (!refreshed) {
              setAnalysisDelayed(true);
              return;
            }
            const found = refreshed.count - prevCountRef.current;
            const totalFound = found + refreshed.factFound;
            setAnalysisCompletedWithoutResults(refreshed.count === 0 && refreshed.factFound === 0);
            if (totalFound > 0) toast.success(`확인할 기억 ${totalFound}개를 찾았습니다`);
            return;
          }
        }

        const newCount = await getSuggestionCount(projectId);
        if (!isCurrent()) return;
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
          if (!isCurrent()) return;
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
              if (!isCurrent()) return;
              if (!result.error) {
                setSuggestions(result.suggestions);
                setCount(result.suggestions.length);
              }
              await refreshFactSuggestions();
              if (!isCurrent()) return;
              await refreshAliasTargets();
              if (!isCurrent()) return;
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
          if (!isCurrent()) return;
          if (!result.error) setSuggestions(result.suggestions);
          await refreshFactSuggestions();
          if (!isCurrent()) return;
          await refreshAliasTargets();
          if (!isCurrent()) return;
          toast.success(`확인할 기억 ${newCount - prevCountRef.current}개를 찾았습니다`);
          return;
        }
        setCount(newCount);
      } catch {
        // A failed read is not evidence that analysis succeeded or failed.
        // The bounded poll will retry and eventually show a delay notice.
      } finally {
        checking = false;
      }
    }, POLL_INTERVAL);
  });

  const refreshResults = useEffectEvent(async (generation: number) => {
    const [result, facts, targets] = await Promise.allSettled([
      getSuggestions(projectId),
      refreshFactSuggestions(),
      refreshAliasTargets(),
    ]);
    if (generation !== generationRef.current) return null;
    if (result.status === "rejected" || result.value.error) return null;
    setSuggestions(result.value.suggestions);
    setCount(result.value.suggestions.length);
    if (facts.status === "rejected" || targets.status === "rejected") return null;
    return { count: result.value.suggestions.length, factFound: facts.value };
  });

  const restoreLatestStatus = useEffectEvent(async (generation: number) => {
    setAnalyzing(false);
    setAutoRegisteredEntityCount(0);
    setAutoRegisteredRelationCount(0);
    setAutoRegisteredNames([]);
    setAnalysisFailed(false);
    setAnalysisDelayed(false);
    setAnalysisCompletedWithoutResults(false);
    if (!chapterId) return;
    try {
      const { error, job } = await getLatestAnalysisJob(projectId, chapterId);
      if (generation !== generationRef.current) return;
      if (error) {
        setAnalysisDelayed(true);
        return;
      }
      if (job?.status === "FAILED") {
        setAnalysisFailed(true);
        await refreshResults(generation);
      }
    } catch {
      // Keep unavailable status distinct from an empty successful result.
      if (generation === generationRef.current) setAnalysisDelayed(true);
    }
  });

  const cancelPolling = useEffectEvent(() => {
    ++generationRef.current;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    pollTimerRef.current = null;
    onAnalyzingChange?.(false);
  });

  useEffect(() => {
    const generation = ++generationRef.current;
    const saved = saveSignal > 0 && (
      saveSignal !== previousSaveSignalRef.current || contextKey === previousContextRef.current
    );
    previousSaveSignalRef.current = saveSignal;
    previousContextRef.current = contextKey;
    if (saved) beginPolling();
    else void restoreLatestStatus(generation);
    return () => cancelPolling();
  }, [projectId, chapterId, saveSignal, contextKey]);

  return {
    analyzing,
    autoRegisteredEntityCount,
    autoRegisteredRelationCount,
    autoRegisteredNames,
    analysisCompletedWithoutResults,
    analysisFailed,
    analysisDelayed,
  };
}
