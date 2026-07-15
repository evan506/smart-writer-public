import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceContainsEvidenceSnippet } from "@/lib/services/entity-extraction/snippet-policy";
import {
  buildStage2ClassificationPrompt,
  buildStage3RelationExtractionPrompt,
} from "@/lib/services/prompt-templates";
import { parseExtractionResponse } from "@/lib/services/entity-extraction/response-normalizer";

type PromptGoldenFixture = {
  promptCases: Array<{
    name: string;
    chapter: string;
    mustContain: string[];
  }>;
  modelOutputCases: Array<{
    name: string;
    source: string;
    rawOutput: string;
    expectedSourceBacked: boolean;
  }>;
};

const fixture = JSON.parse(
  readFileSync(
    join(process.cwd(), "tests/fixtures/extraction/prompt-golden-cases.json"),
    "utf8"
  )
) as PromptGoldenFixture;

describe("prompt golden fixtures", () => {
  it("keeps guardrails and domain rules in prompts for golden cases", () => {
    for (const testCase of fixture.promptCases) {
      const stage2 = buildStage2ClassificationPrompt(
        `리엔: ${testCase.chapter}`,
        "(없음)"
      );
      const stage3 = buildStage3RelationExtractionPrompt(
        "- 리엔 (CHARACTER)\n- 검은 관리자 (ORGANIZATION)",
        `[리엔 & 검은 관리자]: "${testCase.chapter}"`,
        []
      );
      const promptText = [
        stage2.system,
        stage2.user,
        stage3.system,
        stage3.user,
      ].join("\n");

      for (const expected of testCase.mustContain) {
        expect(promptText, testCase.name).toContain(expected);
      }
    }
  });

  it("evaluates golden model outputs with source-backed evidence checks", () => {
    for (const testCase of fixture.modelOutputCases) {
      const parsed = parseExtractionResponse(testCase.rawOutput);
      expect(parsed, testCase.name).not.toBeNull();

      const relationSnippet = parsed?.relations[0]?.context_snippet;
      expect(
        sourceContainsEvidenceSnippet(testCase.source, relationSnippet),
        testCase.name
      ).toBe(testCase.expectedSourceBacked);
    }
  });
});
