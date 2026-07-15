import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { chunkChapter } from "@/lib/services/chunking.service";
import type { Database } from "@/types/database.types";

type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];
type ChapterInsert = Database["public"]["Tables"]["chapters"]["Insert"];
type ChunkInsert = Database["public"]["Tables"]["chunks"]["Insert"];
type EntityInsert = Database["public"]["Tables"]["entities"]["Insert"];
type EntityLinkInsert = Database["public"]["Tables"]["entity_links"]["Insert"];

type BlackironExtractionResult = {
  source: string;
  title: string;
  genre: string;
  chapters: Array<{
    chapterNum: number;
    title: string;
    content: string;
  }>;
  entities: Array<{
    name: string;
    type: string;
    sub_type?: string | null;
    summary: string;
    aliases: string[];
    confidence: number;
    status: string;
    first_chapter: number;
  }>;
  relations: Array<{
    from: string;
    to: string;
    type: string;
    direction: string;
    weight: number;
    context_snippet: string;
    chapter: number;
  }>;
};

export type BlackironSeedContract = {
  ids: {
    userId: string;
    projectId: string;
  };
  project: ProjectInsert;
  chapters: ChapterInsert[];
  chunks: ChunkInsert[];
  entities: EntityInsert[];
  entityLinks: EntityLinkInsert[];
  entityIdsByName: Record<string, string>;
  chapterIdsByNumber: Record<number, string>;
  expectedQueries: Array<{
    id: string;
    query: string;
    expectedEntityIds: string[];
    expectedChapterIds: string[];
    acceptableTopK: number;
  }>;
  expectedVectorQueries: Array<{
    id: string;
    query: string;
    queryEmbedding: number[];
    expectedChunkIds: string[];
    acceptableTopK: number;
  }>;
  expectedGraphQueries: Array<{
    id: string;
    startEntityId: string;
    maxDepth: number;
    expectedEntityIds: string[];
  }>;
};

const SEED_SOURCE_PATH = join(process.cwd(), "tests/fixtures/search/blackiron-seed-source.json");
const FIXED_NOW = "2026-05-22T00:00:00.000Z";
const PROJECT_KEY = "blackiron";
export const TEST_EMBEDDING_DIMENSIONS = 1536;

function stableUuid(...parts: Array<string | number>): string {
  const hash = createHash("sha256").update(parts.join(":")).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function readExtractionResult(): BlackironExtractionResult {
  return JSON.parse(readFileSync(SEED_SOURCE_PATH, "utf8")) as BlackironExtractionResult;
}

function makeEntityId(name: string): string {
  return stableUuid(PROJECT_KEY, "entity", name);
}

export function deterministicTestEmbedding(seed: string): number[] {
  const values: number[] = [];
  let counter = 0;

  while (values.length < TEST_EMBEDDING_DIMENSIONS) {
    const hash = createHash("sha256").update(`${PROJECT_KEY}:embedding:${seed}:${counter}`).digest();
    for (const byte of hash) {
      if (values.length >= TEST_EMBEDDING_DIMENSIONS) break;
      values.push(byte / 127.5 - 1);
    }
    counter += 1;
  }

  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  return values.map((value) => Number((value / magnitude).toFixed(8)));
}

function buildNameIndex(entities: EntityInsert[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const entity of entities) {
    result[entity.name] = entity.id!;
    const aliases = Array.isArray(entity.aliases) ? entity.aliases : [];
    for (const alias of aliases) {
      if (typeof alias === "string" && !result[alias]) {
        result[alias] = entity.id!;
      }
    }
  }

  return result;
}

export function buildBlackironSeedContract(): BlackironSeedContract {
  const extraction = readExtractionResult();
  const userId = stableUuid(PROJECT_KEY, "user");
  const projectId = stableUuid(PROJECT_KEY, "project");

  const project: ProjectInsert = {
    id: projectId,
    user_id: userId,
    title: extraction.title,
    genre: extraction.genre,
    description: `Search/RAG DB-backed evaluation seed derived from ${extraction.source}.`,
    metadata: {
      fixture: extraction.source,
      source: "tests/fixtures/search/blackiron-seed-source.json",
    },
    created_at: FIXED_NOW,
    updated_at: FIXED_NOW,
  };

  const chapterIdsByNumber: Record<number, string> = {};
  const chapters: ChapterInsert[] = [];
  const chunks: ChunkInsert[] = [];
  const chunkIdsByKey: Record<string, string> = {};

  for (const sourceChapter of extraction.chapters) {
    const content = sourceChapter.content.replace(/^\uFEFF/, "").trim();
    const chapterId = stableUuid(PROJECT_KEY, "chapter", sourceChapter.chapterNum);
    chapterIdsByNumber[sourceChapter.chapterNum] = chapterId;
    chapters.push({
      id: chapterId,
      project_id: projectId,
      chapter_num: sourceChapter.chapterNum,
      title: sourceChapter.title,
      content,
      word_count: content.length,
      created_at: FIXED_NOW,
      updated_at: FIXED_NOW,
    });

    for (const chunk of chunkChapter(content)) {
      const chunkKey = `${sourceChapter.chapterNum}:${chunk.position}`;
      const chunkId = stableUuid(PROJECT_KEY, "chunk", sourceChapter.chapterNum, chunk.position);
      chunkIdsByKey[chunkKey] = chunkId;
      chunks.push({
        id: chunkId,
        chapter_id: chapterId,
        content: chunk.content,
        embedding: JSON.stringify(deterministicTestEmbedding(`chunk:${chunkKey}`)),
        type: chunk.type,
        position: chunk.position,
        created_at: FIXED_NOW,
      });
    }
  }

  const entities: EntityInsert[] = extraction.entities.map((entity) => ({
    id: makeEntityId(entity.name),
    project_id: projectId,
    name: entity.name,
    type: entity.type,
    summary: entity.summary,
    aliases: entity.aliases,
    metadata: {
      fixture: PROJECT_KEY,
      subType: entity.sub_type,
      confidence: entity.confidence,
      status: entity.status,
      firstChapter: entity.first_chapter,
    },
    created_at: FIXED_NOW,
    updated_at: FIXED_NOW,
  }));

  const entityIdsByName = buildNameIndex(entities);
  const entityLinks: EntityLinkInsert[] = extraction.relations
    .map((relation, index): EntityLinkInsert | null => {
      const fromId = entityIdsByName[relation.from];
      const toId = entityIdsByName[relation.to];
      if (!fromId || !toId) return null;

      return {
        id: stableUuid(PROJECT_KEY, "entity-link", index, relation.from, relation.to, relation.type),
        from_id: fromId,
        to_id: toId,
        relation_type: relation.type,
        direction: relation.direction,
        weight: relation.weight,
        description: relation.context_snippet,
        created_at: FIXED_NOW,
      };
    })
    .filter((link): link is EntityLinkInsert => link !== null);

  return {
    ids: { userId, projectId },
    project,
    chapters,
    chunks,
    entities,
    entityLinks,
    entityIdsByName,
    chapterIdsByNumber,
    expectedQueries: [
      {
        id: "blackiron-rien-exact",
        query: "리엔",
        expectedEntityIds: [entityIdsByName["리엔 하르트"]],
        expectedChapterIds: [],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-rien-mira-relationship",
        query: "리엔과 미라의 관계",
        expectedEntityIds: [entityIdsByName["리엔 하르트"], entityIdsByName["미라"]],
        expectedChapterIds: [],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-mira-maid",
        query: "미라 시녀",
        expectedEntityIds: [entityIdsByName["미라"]],
        expectedChapterIds: [],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-frontier-fortress-scene",
        query: "변경 흑철 성채 장면",
        expectedEntityIds: [entityIdsByName["흑철 성채"]],
        expectedChapterIds: [chapterIdsByNumber[1]],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-fortress-demon-threat",
        query: "성채 병사 마족 위협",
        expectedEntityIds: [],
        expectedChapterIds: [chapterIdsByNumber[4]],
        acceptableTopK: 8,
      },
      {
        id: "blackiron-high-elf-orc",
        query: "하이엘프와 오크",
        expectedEntityIds: [entityIdsByName["하이엘프"], entityIdsByName["오크"]],
        expectedChapterIds: [chapterIdsByNumber[7]],
        acceptableTopK: 8,
      },
    ],
    expectedVectorQueries: [
      {
        id: "blackiron-frontier-fortress-vector",
        query: "변경 흑철 성채 장면",
        queryEmbedding: deterministicTestEmbedding("chunk:1:0"),
        expectedChunkIds: [chunkIdsByKey["1:0"]],
        acceptableTopK: 3,
      },
      {
        id: "blackiron-fortress-threat-vector",
        query: "성채 병사들을 이끌고 마족의 습격에 맞서는 장면",
        queryEmbedding: deterministicTestEmbedding("chunk:4:0"),
        expectedChunkIds: [chunkIdsByKey["4:0"]],
        acceptableTopK: 3,
      },
      {
        id: "blackiron-species-conflict-vector",
        query: "엘프 오크 마족 사이 적대 관계",
        queryEmbedding: deterministicTestEmbedding("chunk:7:0"),
        expectedChunkIds: [chunkIdsByKey["7:0"]],
        acceptableTopK: 3,
      },
    ],
    expectedGraphQueries: [
      {
        id: "blackiron-rien-neighborhood",
        startEntityId: entityIdsByName["리엔 하르트"],
        maxDepth: 2,
        expectedEntityIds: [
          entityIdsByName["하이엘프"],
          entityIdsByName["미라"],
          entityIdsByName["오크"],
        ],
      },
    ],
  };
}
