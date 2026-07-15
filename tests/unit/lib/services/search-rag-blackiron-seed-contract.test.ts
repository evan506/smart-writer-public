import { describe, expect, it } from "vitest";
import {
  buildBlackironSeedContract,
  TEST_EMBEDDING_DIMENSIONS,
} from "../../../fixtures/search/blackiron-seed-contract";

describe("Search/RAG blackiron seed contract", () => {
  it("builds deterministic project, chapter, chunk, and entity seed payloads", () => {
    const seed = buildBlackironSeedContract();
    const rebuilt = buildBlackironSeedContract();

    expect(seed.ids).toEqual(rebuilt.ids);
    expect(seed.project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(seed.project.title).toBe("흑철기사단 연대기");
    expect(seed.project.description).toContain("tests/fixtures/search");
    expect(seed.chapters).toHaveLength(3);
    expect(seed.entities).toHaveLength(5);
    expect(seed.chunks).toHaveLength(3);
    expect(seed.chapters[0]).toMatchObject({
      id: seed.chapterIdsByNumber[1],
      project_id: seed.ids.projectId,
      chapter_num: 1,
      title: "흑철기사단 연대기 1화",
    });
    expect(seed.chunks[0]).toMatchObject({
      chapter_id: seed.chapterIdsByNumber[1],
      type: "CHAPTER",
      position: 0,
    });
    expect(JSON.parse(seed.chunks[0].embedding ?? "[]")).toHaveLength(TEST_EMBEDDING_DIMENSIONS);
  });

  it("maps canonical names and aliases to stable entity ids", () => {
    const seed = buildBlackironSeedContract();
    const rienId = seed.entityIdsByName["리엔 하르트"];

    expect(rienId).toBeDefined();
    expect(seed.entityIdsByName["리엔"]).toBe(rienId);
    expect(seed.entityIdsByName["엘프"]).toBe(seed.entityIdsByName["하이엘프"]);
    expect(seed.entities.find((entity) => entity.name === "리엔 하르트")).toMatchObject({
      id: rienId,
      project_id: seed.ids.projectId,
      type: "CHARACTER",
      aliases: ["리엔"],
    });
  });

  it("resolves extracted relations through canonical and alias names", () => {
    const seed = buildBlackironSeedContract();

    expect(seed.entityLinks.length).toBeGreaterThan(0);
    expect(seed.entityLinks).toContainEqual(
      expect.objectContaining({
        from_id: seed.entityIdsByName["리엔 하르트"],
        to_id: seed.entityIdsByName["하이엘프"],
        relation_type: "SPECIES_OF",
        direction: "UNI",
      })
    );
    expect(seed.entityLinks).toContainEqual(
      expect.objectContaining({
        from_id: seed.entityIdsByName["미라"],
        to_id: seed.entityIdsByName["리엔 하르트"],
        relation_type: "SERVES",
      })
    );
  });

  it("defines stable expected Search/RAG query ids for the future DB-backed runner", () => {
    const seed = buildBlackironSeedContract();

    expect(seed.expectedQueries).toEqual([
      {
        id: "blackiron-rien-exact",
        query: "리엔",
        expectedEntityIds: [seed.entityIdsByName["리엔 하르트"]],
        expectedChapterIds: [],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-rien-mira-relationship",
        query: "리엔과 미라의 관계",
        expectedEntityIds: [
          seed.entityIdsByName["리엔 하르트"],
          seed.entityIdsByName["미라"],
        ],
        expectedChapterIds: [],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-mira-maid",
        query: "미라 시녀",
        expectedEntityIds: [seed.entityIdsByName["미라"]],
        expectedChapterIds: [],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-frontier-fortress-scene",
        query: "변경 흑철 성채 장면",
        expectedEntityIds: [seed.entityIdsByName["흑철 성채"]],
        expectedChapterIds: [seed.chapterIdsByNumber[1]],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-fortress-demon-threat",
        query: "성채 병사 마족 위협",
        expectedEntityIds: [],
        expectedChapterIds: [seed.chapterIdsByNumber[4]],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-high-elf-orc",
        query: "하이엘프와 오크",
        expectedEntityIds: [
          seed.entityIdsByName["하이엘프"],
          seed.entityIdsByName["오크"],
        ],
        expectedChapterIds: [seed.chapterIdsByNumber[7]],
        acceptableTopK: 8,
      },
    ]);
  });

  it("defines deterministic vector expectations for the DB-backed runner", () => {
    const seed = buildBlackironSeedContract();

    expect(seed.expectedVectorQueries).toHaveLength(3);
    expect(seed.expectedVectorQueries[0]).toMatchObject({
      id: "blackiron-frontier-fortress-vector",
      query: "변경 흑철 성채 장면",
      expectedChunkIds: [seed.chunks[0].id],
      acceptableTopK: 3,
    });
    expect(seed.expectedVectorQueries[1]).toMatchObject({
      id: "blackiron-fortress-threat-vector",
      expectedChunkIds: [seed.chunks[1].id],
      acceptableTopK: 3,
    });
    expect(seed.expectedVectorQueries[2]).toMatchObject({
      id: "blackiron-species-conflict-vector",
      expectedChunkIds: [seed.chunks[2].id],
      acceptableTopK: 3,
    });
    for (const [index, query] of seed.expectedVectorQueries.entries()) {
      expect(query.queryEmbedding).toHaveLength(TEST_EMBEDDING_DIMENSIONS);
      expect(query.queryEmbedding).toEqual(JSON.parse(seed.chunks[index].embedding ?? "[]"));
    }
  });

  it("defines graph expansion expectations for the DB-backed runner", () => {
    const seed = buildBlackironSeedContract();

    expect(seed.expectedGraphQueries).toEqual([
      {
        id: "blackiron-rien-neighborhood",
        startEntityId: seed.entityIdsByName["리엔 하르트"],
        maxDepth: 2,
        expectedEntityIds: [
          seed.entityIdsByName["하이엘프"],
          seed.entityIdsByName["미라"],
          seed.entityIdsByName["오크"],
        ],
      },
    ]);
  });
});
