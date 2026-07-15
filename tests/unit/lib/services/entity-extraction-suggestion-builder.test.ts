import { describe, expect, it } from "vitest";
import type { ExtractedEntity, KnownEntity } from "@/lib/services/prompt-templates";
import {
  buildEntitySuggestionInsert,
  buildEntitySuggestionInserts,
  decideEntitySuggestionAction,
  findKnownEntityIdByName,
} from "@/lib/services/entity-extraction/suggestion-builder";
import { normalizedNameSet } from "@/lib/services/entity-extraction-utils";

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

const knownEntities: KnownEntity[] = [
  {
    id: "entity-1",
    name: "리켈",
    type: "CHARACTER",
    aliases: ["검은 늑대"],
  },
  {
    id: "entity-2",
    name: "흑철탑",
    type: "PLACE",
    aliases: [],
  },
];

const buildContext = {
  projectId: "project-1",
  chapterId: "chapter-1",
  knownEntities,
  updatedAt: "2026-05-21T00:00:00.000Z",
};

describe("entity extraction suggestion builder", () => {
  it("builds CREATE suggestion inserts for unknown extracted entities", () => {
    const insert = buildEntitySuggestionInsert(
      entity({
        name: "아린",
        summary: "새로 등장한 인물",
        aliases: ["은빛 사제"],
        confidence: 0.65,
        context_snippet: "아린은 성문 앞에 섰다.",
      }),
      buildContext
    );

    expect(insert).toEqual({
      project_id: "project-1",
      chapter_id: "chapter-1",
      name: "아린",
      type: "CHARACTER",
      summary: "새로 등장한 인물",
      aliases: ["은빛 사제"],
      confidence: 0.65,
      context_snippet: "아린은 성문 앞에 섰다.",
      status: "PENDING",
      suggested_action: "CREATE",
      matched_entity_id: null,
      updated_at: "2026-05-21T00:00:00.000Z",
    });
  });

  it("marks canonical-name matches as UPDATE suggestions", () => {
    const knownNames = normalizedNameSet(knownEntities.map((knownEntity) => knownEntity.name));

    expect(
      decideEntitySuggestionAction(
        entity({ name: " 리 켈 ", type: "CHARACTER" }),
        knownNames,
        knownEntities
      )
    ).toEqual({
      suggestedAction: "UPDATE",
      matchedEntityId: null,
    });
  });

  it("marks alias references with a known target as MERGE suggestions", () => {
    const insert = buildEntitySuggestionInsert(
      entity({
        name: "늑대 경",
        sub_type: "alias_ref",
        alias_of: "검은 늑대",
      }),
      buildContext
    );

    expect(insert).toMatchObject({
      name: "늑대 경",
      suggested_action: "MERGE",
      matched_entity_id: "entity-1",
    });
  });

  it("skips alias references when no merge target can be resolved", () => {
    const inserts = buildEntitySuggestionInserts(
      [
        entity({
          name: "은빛 검객",
          sub_type: "alias_ref",
          alias_of: "없는 인물",
        }),
        entity({
          name: "아린",
        }),
      ],
      buildContext
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      name: "아린",
      suggested_action: "CREATE",
    });
  });

  it("resolves merge targets by canonical name or existing alias", () => {
    expect(findKnownEntityIdByName(knownEntities, "리 켈")).toBe("entity-1");
    expect(findKnownEntityIdByName(knownEntities, " 검은늑대 ")).toBe("entity-1");
    expect(findKnownEntityIdByName(knownEntities, "")).toBeNull();
  });
});
