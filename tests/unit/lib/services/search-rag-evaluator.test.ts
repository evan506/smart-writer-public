import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateSearchTopK,
  summarizeSearchRecallByTopK,
  summarizeSearchRecall,
  type SearchTopKCase,
} from "./search-rag-evaluator";

type SearchEvaluationFixture = {
  topKEvaluation: {
    acceptableTopK: number;
    cases: SearchTopKCase[];
  };
};

const fixturePath = join(process.cwd(), "tests/fixtures/search/queries.json");

function readEvaluationFixture(): SearchEvaluationFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as SearchEvaluationFixture;
}

describe("Search/RAG top-k evaluation fixtures", () => {
  const fixture = readEvaluationFixture().topKEvaluation;

  it("captures expected entity and chapter hits inside acceptable top-k", () => {
    const result = evaluateSearchTopK(fixture.cases[0], fixture.acceptableTopK);

    expect(result).toMatchObject({
      hitEntityIds: ["entity-rien"],
      missingEntityIds: [],
      hitChapterIds: [],
      missingChapterIds: [],
      missingSources: [],
    });
    expect(result.sourceCoverage.bm25).toBeGreaterThan(0);
  });

  it("reports missing source coverage separately from result hits", () => {
    const result = evaluateSearchTopK(fixture.cases[1], fixture.acceptableTopK);

    expect(result.hitEntityIds).toEqual(["entity-rien", "entity-kai"]);
    expect(result.hitChapterIds).toEqual(["chapter-bond"]);
    expect(result.missingEntityIds).toEqual([]);
    expect(result.missingChapterIds).toEqual([]);
    expect(result.sourceCoverage).toEqual({ graph: 2, vector: 0, bm25: 1 });
    expect(result.missingSources).toEqual(["vector"]);
  });

  it("summarizes top-k recall across entity, chapter, chunk, and source expectations", () => {
    const cases: SearchTopKCase[] = [
      {
        id: "all-hit",
        query: "리엔 검은 서고",
        expectedEntityIds: ["entity-rien"],
        expectedChapterIds: ["chapter-library"],
        expectedChunkIds: ["chunk-library"],
        requiredSources: ["bm25", "vector"],
        results: [
          {
            id: "entity-rien",
            source: "bm25",
            type: "entity",
            title: "리엔",
            score: 1,
          },
          {
            id: "chapter-library",
            source: "bm25",
            type: "chapter",
            title: "검은 서고",
            score: 0.9,
          },
          {
            id: "chunk-library",
            source: "vector",
            type: "chunk",
            title: "검은 서고 장면",
            score: 0.8,
          },
        ],
      },
      {
        id: "missing-chapter-and-source",
        query: "카이 관계 장면",
        expectedEntityIds: ["entity-kai"],
        expectedChapterIds: ["chapter-bond"],
        requiredSources: ["graph", "vector"],
        results: [
          {
            id: "entity-kai",
            source: "graph",
            type: "entity",
            title: "카이",
            score: 1,
          },
        ],
      },
    ];

    const summary = summarizeSearchRecall(cases, 3);

    expect(summary).toEqual({
      topK: 3,
      caseCount: 2,
      fullyHitCases: 1,
      entityRecall: 1,
      chapterRecall: 0.5,
      chunkRecall: 1,
      overallRecall: 0.8,
      sourceCoverage: { graph: 1, vector: 1, bm25: 2 },
      missingCaseIds: ["missing-chapter-and-source"],
    });
  });

  it("summarizes recall for multiple top-k thresholds in sorted unique order", () => {
    const cases: SearchTopKCase[] = [
      {
        id: "rank-sensitive",
        query: "검은 서고",
        expectedEntityIds: ["entity-library"],
        expectedChapterIds: ["chapter-library"],
        requiredSources: ["bm25"],
        results: [
          {
            id: "entity-library",
            source: "bm25",
            type: "entity",
            title: "검은 서고",
            score: 1,
          },
          {
            id: "chapter-other",
            source: "bm25",
            type: "chapter",
            title: "다른 장면",
            score: 0.8,
          },
          {
            id: "chapter-library",
            source: "bm25",
            type: "chapter",
            title: "검은 서고 장면",
            score: 0.7,
          },
        ],
      },
    ];

    const summaries = summarizeSearchRecallByTopK(cases, [8, 3, 1, 3]);

    expect(Object.keys(summaries)).toEqual(["1", "3", "8"]);
    expect(summaries[1]).toMatchObject({
      topK: 1,
      fullyHitCases: 0,
      chapterRecall: 0,
      overallRecall: 0.5,
      missingCaseIds: ["rank-sensitive"],
    });
    expect(summaries[3]).toMatchObject({
      topK: 3,
      fullyHitCases: 1,
      chapterRecall: 1,
      overallRecall: 1,
      missingCaseIds: [],
    });
    expect(summaries[8]).toMatchObject({
      topK: 8,
      fullyHitCases: summaries[3].fullyHitCases,
      entityRecall: summaries[3].entityRecall,
      chapterRecall: summaries[3].chapterRecall,
      overallRecall: summaries[3].overallRecall,
      missingCaseIds: summaries[3].missingCaseIds,
    });
  });
});
