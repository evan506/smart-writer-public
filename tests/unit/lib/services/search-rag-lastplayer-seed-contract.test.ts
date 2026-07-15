import { describe, expect, it } from "vitest";
import { TEST_EMBEDDING_DIMENSIONS } from "../../../fixtures/search/blackiron-seed-contract";
import { buildLastplayerSeedContract } from "../../../fixtures/search/lastplayer-seed-contract";

describe("Search/RAG lastplayer seed contract", () => {
  it("builds deterministic project, chapter, chunk, and entity seed payloads", () => {
    const seed = buildLastplayerSeedContract();
    const rebuilt = buildLastplayerSeedContract();

    expect(seed.ids).toEqual(rebuilt.ids);
    expect(seed.project.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(seed.project.title).toBe("마지막 플레이어");
    expect(seed.project.description).toContain("tests/fixtures/search");
    expect(seed.chapters).toHaveLength(3);
    expect(seed.entities).toHaveLength(5);
    expect(seed.chunks).toHaveLength(3);
    expect(seed.chapters[0]).toMatchObject({
      id: seed.chapterIdsByNumber[1],
      project_id: seed.ids.projectId,
      chapter_num: 1,
      title: "마지막 플레이어 1화",
    });
    expect(seed.chunks[0]).toMatchObject({
      chapter_id: seed.chapterIdsByNumber[1],
      type: "CHAPTER",
      position: 0,
    });
    expect(JSON.parse(seed.chunks[0].embedding ?? "[]")).toHaveLength(TEST_EMBEDDING_DIMENSIONS);
  });

  it("maps canonical names and aliases to stable entity ids", () => {
    const seed = buildLastplayerSeedContract();
    const protagonistId = seed.entityIdsByName["주인공"];

    expect(protagonistId).toBeDefined();
    expect(seed.entityIdsByName["강철주먹 카일"]).toBe(protagonistId);
    expect(seed.entityIdsByName["카일"]).toBe(protagonistId);
    expect(seed.entityIdsByName["제국놈들"]).toBe(seed.entityIdsByName["제국"]);
    expect(seed.entityIdsByName["고양이 수인"]).toBe(seed.entityIdsByName["수인"]);
  });

  it("resolves extracted relations through canonical names", () => {
    const seed = buildLastplayerSeedContract();

    expect(seed.entityLinks).toHaveLength(3);
    expect(seed.entityLinks).toContainEqual(
      expect.objectContaining({
        from_id: seed.entityIdsByName["주인공"],
        to_id: seed.entityIdsByName["제국"],
        relation_type: "ENEMY",
        direction: "BI",
      })
    );
    expect(seed.entityLinks).toContainEqual(
      expect.objectContaining({
        from_id: seed.entityIdsByName["주인공"],
        to_id: seed.entityIdsByName["수인"],
        relation_type: "PROTECTS",
      })
    );
  });

  it("defines expected BM25, vector, and graph query ids", () => {
    const seed = buildLastplayerSeedContract();

    expect(seed.expectedQueries).toEqual([
      {
        id: "lastplayer-main-character",
        query: "주인공",
        expectedEntityIds: [seed.entityIdsByName["주인공"]],
        expectedChapterIds: [],
        acceptableTopK: 8,
      },
      {
        id: "lastplayer-empire-slavery",
        query: "제국 노예제도",
        expectedEntityIds: [seed.entityIdsByName["제국"]],
        expectedChapterIds: [seed.chapterIdsByNumber[2]],
        acceptableTopK: 8,
      },
      {
        id: "lastplayer-monster-forest",
        query: "숲 괴수 무리",
        expectedEntityIds: [seed.entityIdsByName["괴수"]],
        expectedChapterIds: [seed.chapterIdsByNumber[3]],
        acceptableTopK: 8,
      },
    ]);

    expect(seed.expectedVectorQueries).toHaveLength(2);
    expect(seed.expectedVectorQueries[0]).toMatchObject({
      id: "lastplayer-rescue-vector",
      expectedChunkIds: [seed.chunks[0].id],
      acceptableTopK: 3,
    });
    expect(seed.expectedVectorQueries[1]).toMatchObject({
      id: "lastplayer-monster-vector",
      expectedChunkIds: [seed.chunks[2].id],
      acceptableTopK: 3,
    });
    for (const query of seed.expectedVectorQueries) {
      expect(query.queryEmbedding).toHaveLength(TEST_EMBEDDING_DIMENSIONS);
    }

    expect(seed.expectedGraphQueries).toEqual([
      {
        id: "lastplayer-protagonist-neighborhood",
        startEntityId: seed.entityIdsByName["주인공"],
        maxDepth: 2,
        expectedEntityIds: [
          seed.entityIdsByName["제국"],
          seed.entityIdsByName["수인"],
          seed.entityIdsByName["괴수"],
        ],
      },
    ]);
  });
});
