import { describe, expect, it } from "vitest";
import type { Chapter, Chunk, Mention } from "@/types";
import { buildEvidenceByEntity } from "@/lib/services/report/mappers";

type ReportChunkSource = Pick<
  Chunk,
  | "id"
  | "chapter_id"
  | "content"
  | "created_at"
  | "entity_tags"
  | "position"
  | "summary"
  | "type"
>;

function chapter(id: string, chapterNum: number): Chapter {
  return {
    id,
    project_id: "project-1",
    chapter_num: chapterNum,
    title: `제${chapterNum}화`,
    content: null,
    summary: null,
    arc_summary: null,
    word_count: null,
    created_at: null,
    updated_at: null,
  };
}

function chunk(id: string, chapterId: string, position: number): ReportChunkSource {
  return {
    id,
    chapter_id: chapterId,
    content: `${id} content`,
    created_at: null,
    entity_tags: null,
    position,
    summary: null,
    type: "SCENE",
  };
}

function mention(chunkId: string, count: number): Mention {
  return {
    id: `mention-${chunkId}`,
    entity_id: "entity-1",
    chunk_id: chunkId,
    count,
    last_mentioned_at: null,
  };
}

describe("ReportService evidence summary", () => {
  it("keeps mentionCount independent from the evidence display limit", () => {
    const chapterMap = new Map([
      ["chapter-1", chapter("chapter-1", 1)],
      ["chapter-2", chapter("chapter-2", 2)],
    ]);
    const chunkMap = new Map([
      ["chunk-1", chunk("chunk-1", "chapter-1", 1)],
      ["chunk-2", chunk("chunk-2", "chapter-1", 2)],
      ["chunk-3", chunk("chunk-3", "chapter-2", 1)],
      ["chunk-4", chunk("chunk-4", "chapter-2", 2)],
    ]);

    const result = buildEvidenceByEntity(
      [
        mention("chunk-1", 2),
        mention("chunk-2", 3),
        mention("chunk-3", 5),
        mention("chunk-4", 7),
      ],
      chunkMap,
      chapterMap,
      3
    );

    const summary = result.get("entity-1");

    expect(summary?.evidence).toHaveLength(3);
    expect(summary?.firstMentionChapterNum).toBe(1);
    expect(summary?.mentionCount).toBe(17);
  });
});
