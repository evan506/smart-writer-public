import { describe, expect, it } from "vitest";
import { buildFactSuggestionInserts } from "@/lib/services/entity-extraction/fact-suggestion-writes";
import type { ExtractedEntity, KnownEntity } from "@/lib/services/prompt-templates";

function entity(overrides: Partial<ExtractedEntity> & Pick<ExtractedEntity, "name">): ExtractedEntity {
  return {
    type: "CHARACTER",
    summary: "",
    aliases: [],
    confidence: 0.7,
    context_snippet: "",
    ...overrides,
  };
}

describe("fact suggestion writes", () => {
  it("connects facts for pending entity suggestions by suggestion id", () => {
    const inserts = buildFactSuggestionInserts({
      projectId: "project-1",
      chapterId: "chapter-1",
      entities: [
        entity({
          name: "리엔",
          facts: [
            {
              fact_type: "ROLE",
              value: "변방 마을의 영주",
              evidence: "리엔는 변방 마을의 영주로 불렸다.",
              confidence: 0.8,
            },
          ],
        }),
      ],
      entitySuggestionRefs: new Map([
        ["리엔", { id: "suggestion-1", matched_entity_id: null }],
      ]),
      knownEntities: [],
    });

    expect(inserts).toEqual([
      {
        project_id: "project-1",
        chapter_id: "chapter-1",
        entity_suggestion_id: "suggestion-1",
        matched_entity_id: null,
        fact_type: "ROLE",
        fact_key: null,
        value: "변방 마을의 영주",
        confidence: 0.8,
        evidence_text: "리엔는 변방 마을의 영주로 불렸다.",
        status: "PENDING",
      },
    ]);
  });

  it("resolves unique approved entity IDs without auto-confirming a candidate", () => {
    const knownEntities: KnownEntity[] = [
      {
        id: "entity-known",
        name: "세란",
        type: "CHARACTER",
        aliases: ["검은 늑대"],
      },
    ];

    const inserts = buildFactSuggestionInserts({
      projectId: "project-1",
      chapterId: "chapter-1",
      entities: [
        entity({
          name: "리엔",
          facts: [
            {
              fact_type: "ATTRIBUTE",
              fact_key: "race",
              value: "하이엘프",
              evidence: "리엔는 하이엘프였다.",
            },
          ],
        }),
        entity({
          name: "검은 늑대",
          facts: [
            {
              fact_type: "STATE",
              value: "수배 중",
              evidence: "검은 늑대는 수배 중이었다.",
            },
          ],
        }),
      ],
      entitySuggestionRefs: new Map(),
      knownEntities,
    });

    expect(inserts.map((insert) => insert.matched_entity_id)).toEqual([
      null,
      "entity-known",
    ]);
  });

  it("leaves ambiguous names and unresolved review targets waiting for entity approval", () => {
    const entities = [entity({ name: "검은 늑대", facts: [{ fact_type: "STATE", value: "수배 중", evidence: "검은 늑대는 수배 중이었다." }] })];
    const knownEntities: KnownEntity[] = [
      { id: "first", name: "세란", type: "CHARACTER", aliases: ["검은 늑대"] },
      { id: "second", name: "세란2", type: "CHARACTER", aliases: ["검은늑대"] },
    ];
    const input = { projectId: "project", chapterId: "chapter", entities, knownEntities, entitySuggestionRefs: new Map() };
    expect(buildFactSuggestionInserts(input)[0].matched_entity_id).toBeNull();
    expect(buildFactSuggestionInserts({
      ...input, knownEntities: [knownEntities[0]],
      entitySuggestionRefs: new Map([["검은 늑대", { id: "waiting", matched_entity_id: null }]]),
    })[0]).toMatchObject({ matched_entity_id: null, entity_suggestion_id: "waiting", status: "PENDING" });
  });

});
