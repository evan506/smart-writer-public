import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyQuery, selectModes } from "@/lib/services/query-router";
import type { QueryClassification, RAGMode } from "@/types";

type SearchFixture = {
  description: string;
  cases: Array<{
    id: string;
    query: string;
    expectedMode: QueryClassification["mode"];
    expectedModes: RAGMode[];
    expectedReasonIncludes: string;
    notes: string;
  }>;
  topKEvaluation: {
    acceptableTopK: number;
    cases: Array<{
      id: string;
      query: string;
      expectedEntityIds: string[];
      expectedChapterIds: string[];
      requiredSources: Array<"graph" | "vector" | "bm25">;
      results: Array<{
        id: string;
        source: "graph" | "vector" | "bm25";
        type: "entity" | "chunk" | "chapter";
        title: string;
        score: number;
      }>;
    }>;
  };
};

const fixturePath = join(process.cwd(), "tests/fixtures/search/queries.json");

function readSearchFixture(): SearchFixture {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as SearchFixture;
}

describe("Search/RAG query fixtures", () => {
  const fixture = readSearchFixture();

  it.each(fixture.cases)(
    "routes $id to the expected retrieval modes",
    ({ query, expectedMode, expectedModes, expectedReasonIncludes }) => {
      const classification = classifyQuery(query);

      expect(classification.mode).toBe(expectedMode);
      expect(classification.reasoning).toContain(expectedReasonIncludes);
      expect(selectModes(classification)).toEqual(expectedModes);
    }
  );

  it("documents the top-k evaluation fixture contract", () => {
    expect(fixture.topKEvaluation.acceptableTopK).toBe(8);
    expect(fixture.topKEvaluation.cases[0]).toMatchObject({
      id: expect.any(String),
      query: expect.any(String),
      expectedEntityIds: expect.any(Array),
      expectedChapterIds: expect.any(Array),
      requiredSources: expect.any(Array),
      results: expect.any(Array),
    });
  });
});
