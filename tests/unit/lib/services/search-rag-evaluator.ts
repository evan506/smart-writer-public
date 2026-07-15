import type { RAGResultItem } from "@/lib/services/rag-search.service";

export type SearchTopKCase = {
  id: string;
  query: string;
  expectedEntityIds: string[];
  expectedChapterIds: string[];
  expectedChunkIds?: string[];
  requiredSources: RAGResultItem["source"][];
  results: Array<Pick<RAGResultItem, "id" | "source" | "type" | "title" | "score">>;
};

export type SearchTopKEvaluationResult = {
  topK: number;
  hitEntityIds: string[];
  missingEntityIds: string[];
  hitChapterIds: string[];
  missingChapterIds: string[];
  hitChunkIds: string[];
  missingChunkIds: string[];
  sourceCoverage: Record<RAGResultItem["source"], number>;
  missingSources: RAGResultItem["source"][];
};

export type SearchRecallSummary = {
  topK: number;
  caseCount: number;
  fullyHitCases: number;
  entityRecall: number;
  chapterRecall: number;
  chunkRecall: number;
  overallRecall: number;
  sourceCoverage: Record<RAGResultItem["source"], number>;
  missingCaseIds: string[];
};

export type SearchRecallSummaryByTopK = Record<number, SearchRecallSummary>;

export function evaluateSearchTopK(
  testCase: SearchTopKCase,
  topK: number
): SearchTopKEvaluationResult {
  const topResults = testCase.results.slice(0, topK);
  const ids = new Set(topResults.map((item) => item.id));

  const sourceCoverage = topResults.reduce<SearchTopKEvaluationResult["sourceCoverage"]>(
    (acc, item) => {
      acc[item.source] += 1;
      return acc;
    },
    { graph: 0, vector: 0, bm25: 0 }
  );

  return {
    topK,
    hitEntityIds: testCase.expectedEntityIds.filter((id) => ids.has(id)),
    missingEntityIds: testCase.expectedEntityIds.filter((id) => !ids.has(id)),
    hitChapterIds: testCase.expectedChapterIds.filter((id) => ids.has(id)),
    missingChapterIds: testCase.expectedChapterIds.filter((id) => !ids.has(id)),
    hitChunkIds: (testCase.expectedChunkIds ?? []).filter((id) => ids.has(id)),
    missingChunkIds: (testCase.expectedChunkIds ?? []).filter((id) => !ids.has(id)),
    sourceCoverage,
    missingSources: testCase.requiredSources.filter((source) => sourceCoverage[source] === 0),
  };
}

function ratio(hitCount: number, expectedCount: number): number {
  if (expectedCount === 0) return 1;
  return Number((hitCount / expectedCount).toFixed(4));
}

export function summarizeSearchRecall(
  testCases: SearchTopKCase[],
  topK: number
): SearchRecallSummary {
  const evaluations = testCases.map((testCase) => ({
    id: testCase.id,
    expectedEntityCount: testCase.expectedEntityIds.length,
    expectedChapterCount: testCase.expectedChapterIds.length,
    expectedChunkCount: testCase.expectedChunkIds?.length ?? 0,
    result: evaluateSearchTopK(testCase, topK),
  }));

  const totals = evaluations.reduce(
    (acc, evaluation) => {
      acc.expectedEntities += evaluation.expectedEntityCount;
      acc.hitEntities += evaluation.result.hitEntityIds.length;
      acc.expectedChapters += evaluation.expectedChapterCount;
      acc.hitChapters += evaluation.result.hitChapterIds.length;
      acc.expectedChunks += evaluation.expectedChunkCount;
      acc.hitChunks += evaluation.result.hitChunkIds.length;
      acc.sourceCoverage.graph += evaluation.result.sourceCoverage.graph;
      acc.sourceCoverage.vector += evaluation.result.sourceCoverage.vector;
      acc.sourceCoverage.bm25 += evaluation.result.sourceCoverage.bm25;
      return acc;
    },
    {
      expectedEntities: 0,
      hitEntities: 0,
      expectedChapters: 0,
      hitChapters: 0,
      expectedChunks: 0,
      hitChunks: 0,
      sourceCoverage: { graph: 0, vector: 0, bm25: 0 },
    }
  );

  const missingCaseIds = evaluations
    .filter(
      (evaluation) =>
        evaluation.result.missingEntityIds.length > 0 ||
        evaluation.result.missingChapterIds.length > 0 ||
        evaluation.result.missingChunkIds.length > 0 ||
        evaluation.result.missingSources.length > 0
    )
    .map((evaluation) => evaluation.id);

  const expectedTotal = totals.expectedEntities + totals.expectedChapters + totals.expectedChunks;
  const hitTotal = totals.hitEntities + totals.hitChapters + totals.hitChunks;

  return {
    topK,
    caseCount: testCases.length,
    fullyHitCases: testCases.length - missingCaseIds.length,
    entityRecall: ratio(totals.hitEntities, totals.expectedEntities),
    chapterRecall: ratio(totals.hitChapters, totals.expectedChapters),
    chunkRecall: ratio(totals.hitChunks, totals.expectedChunks),
    overallRecall: ratio(hitTotal, expectedTotal),
    sourceCoverage: totals.sourceCoverage,
    missingCaseIds,
  };
}

export function summarizeSearchRecallByTopK(
  testCases: SearchTopKCase[],
  topKs: number[]
): SearchRecallSummaryByTopK {
  const uniqueTopKs = [...new Set(topKs)].sort((a, b) => a - b);

  return uniqueTopKs.reduce<SearchRecallSummaryByTopK>((acc, topK) => {
    acc[topK] = summarizeSearchRecall(testCases, topK);
    return acc;
  }, {});
}
