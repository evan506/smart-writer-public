import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExtractedEntity } from "@/lib/services/prompt-templates";
import { extractJSONArray } from "@/lib/services/entity-extraction/response-parser";
import {
  canAutoMergeSubstringEntities,
  shouldAutoMergeCharacterSubstring,
} from "@/lib/services/entity-extraction/merge-policy";
import { linkSameBatchCharacterAliasRefs } from "@/lib/services/entity-extraction/alias-policy";
import {
  filterEntityCandidates,
  normalizeGroupLikeCharacterCandidates,
  normalizedNameSet,
  normalizeSpeciesLikeCharacterCandidates,
} from "@/lib/services/entity-extraction/candidate-policy";
import { extractCoOccurrenceSnippets } from "@/lib/services/entity-extraction-utils";

const fixtureDir = join(process.cwd(), "tests/fixtures/extraction");

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), "utf8")) as T;
}

function toEntity(input: Partial<ExtractedEntity> & Pick<ExtractedEntity, "name">): ExtractedEntity {
  return {
    type: "CHARACTER",
    summary: "",
    aliases: [],
    confidence: 0.7,
    context_snippet: "",
    ...input,
  };
}

function runStage2CandidatePolicy(entities: ExtractedEntity[]): ExtractedEntity[] {
  return normalizeGroupLikeCharacterCandidates(
    normalizeSpeciesLikeCharacterCandidates(
      linkSameBatchCharacterAliasRefs(
        entities.filter((entity) => {
          if (entity.sub_type === "alias_ref") {
            return Boolean(entity.alias_of) && entity.confidence >= 0.5;
          }
          return entity.confidence >= 0.5;
        })
      )
    )
  );
}

describe("entity extraction fixture regression", () => {
  it("applies role noun filtering fixtures", () => {
    const fixture = readFixture<{
      candidates: string[];
      expectedCandidates: string[];
    }>("role-nouns.json");

    expect(
      filterEntityCandidates(
        fixture.candidates,
        normalizedNameSet([]),
        normalizedNameSet([]),
        normalizedNameSet([])
      )
    ).toEqual(fixture.expectedCandidates);
  });

  it("applies alias and title fixtures", () => {
    const fixture = readFixture<{
      entities: Array<Partial<ExtractedEntity> & Pick<ExtractedEntity, "name">>;
      expectedAliasRefs: Array<{ name: string; alias_of: string }>;
      expectedNonAliasRefs: string[];
    }>("aliases-and-titles.json");

    const result = linkSameBatchCharacterAliasRefs(fixture.entities.map(toEntity));

    for (const expected of fixture.expectedAliasRefs) {
      expect(result.find((entity) => entity.name === expected.name)).toMatchObject({
        sub_type: "alias_ref",
        alias_of: expected.alias_of,
      });
    }

    for (const name of fixture.expectedNonAliasRefs) {
      expect(result.find((entity) => entity.name === name)?.sub_type).not.toBe("alias_ref");
    }
  });

  it("applies species versus individual fixtures", () => {
    const fixture = readFixture<{
      entities: Array<Partial<ExtractedEntity> & Pick<ExtractedEntity, "name">>;
      expectedTypes: Array<{ name: string; type: string; sub_type?: string }>;
    }>("species-vs-individual.json");

    const result = normalizeGroupLikeCharacterCandidates(
      normalizeSpeciesLikeCharacterCandidates(fixture.entities.map(toEntity))
    );

    for (const expected of fixture.expectedTypes) {
      expect(result.find((entity) => entity.name === expected.name)).toMatchObject(expected);
    }
  });

  it("applies substring merge policy fixtures", () => {
    const fixture = readFixture<{
      cases: Array<{
        shorterName: string;
        longerName: string;
        type: string;
        expected: boolean;
      }>;
    }>("substring-merge-policy.json");

    for (const testCase of fixture.cases) {
      const result =
        canAutoMergeSubstringEntities(testCase.type) &&
        shouldAutoMergeCharacterSubstring(testCase.shorterName, testCase.longerName);

      expect(result).toBe(testCase.expected);
    }
  });

  it("applies targetless merge policy fixtures", () => {
    const fixture = readFixture<{
      entities: Array<Partial<ExtractedEntity> & Pick<ExtractedEntity, "name">>;
      expectedKept: string[];
      expectedDropped: string[];
    }>("targetless-merge-policy.json");

    const result = runStage2CandidatePolicy(fixture.entities.map(toEntity));
    const names = result.map((entity) => entity.name);

    expect(names).toEqual(fixture.expectedKept);
    for (const name of fixture.expectedDropped) {
      expect(names).not.toContain(name);
    }
  });

  it("applies relation evidence policy fixtures", () => {
    const fixture = readFixture<{
      text: string;
      entities: Array<{ name: string; type: string }>;
      expectedPairs: Array<[string, string]>;
      rejectedPairs: Array<[string, string]>;
    }>("relation-evidence-policy.json");

    const result = extractCoOccurrenceSnippets(fixture.text, fixture.entities, {
      range: 80,
    });
    const pairs = result.map((snippet) => [snippet.nameA, snippet.nameB].sort().join("|"));

    for (const pair of fixture.expectedPairs) {
      expect(pairs).toContain([...pair].sort().join("|"));
    }
    for (const pair of fixture.rejectedPairs) {
      expect(pairs).not.toContain([...pair].sort().join("|"));
    }
  });

  it("applies malformed JSON parser fixtures", () => {
    const fixture = readFixture<{
      cases: Array<{ raw: string; expected: unknown[] | null }>;
    }>("malformed-json.json");

    for (const testCase of fixture.cases) {
      expect(extractJSONArray(testCase.raw)).toEqual(testCase.expected);
    }
  });
});
