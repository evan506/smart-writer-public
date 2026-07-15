import { describe, expect, it } from "vitest";
import { chunkChapter } from "@/lib/services/chunking.service";

describe("chunkChapter", () => {
  it("returns no chunks for blank content", () => {
    expect(chunkChapter(" \n\n ")).toEqual([]);
  });

  it("creates a chapter context chunk before scene chunks", () => {
    const scene = "리엔은 검은 서고의 문 앞에 섰다. ".repeat(16);

    expect(chunkChapter(scene)).toEqual([
      { type: "CHAPTER", content: scene.trim(), position: 0 },
      { type: "SCENE", content: scene.trim(), position: 1 },
    ]);
  });

  it("splits scene breaks and preserves increasing positions", () => {
    const first = "첫 번째 장면에서 리엔은 오래된 지도 조각을 발견했다. ".repeat(12);
    const second = "두 번째 장면에서 카이는 그 지도가 왕궁 지하를 가리킨다고 말했다. ".repeat(12);

    const chunks = chunkChapter(`${first}\n\n***\n\n${second}`);

    expect(chunks.map((chunk) => chunk.position)).toEqual([0, 1, 2]);
    expect(chunks.map((chunk) => chunk.type)).toEqual(["CHAPTER", "SCENE", "SCENE"]);
    expect(chunks[1]?.content).toBe(first.trim());
    expect(chunks[2]?.content).toBe(second.trim());
  });

  // Regression: an undersized scene used to be skipped outright, so its text never
  // reached `chunks` — and with it never reached vector search, mention extraction
  // or entity extraction, even though the chapter still displayed it.
  it("absorbs an undersized scene into a neighbour instead of dropping it", () => {
    const long = "리엔은 성채의 성벽을 따라 천천히 걸었다. ".repeat(24);
    const brief = "그날의 기억이 스쳤다.";
    const content = [long, "***", brief, "***", long].join("\n\n");

    const chunks = chunkChapter(content);
    const scenes = chunks.filter((chunk) => chunk.type !== "CHAPTER");

    expect(brief.length).toBeLessThan(213); // below MIN_CHARS / 2
    expect(scenes.some((chunk) => chunk.content.includes(brief))).toBe(true);
  });

  // A short chapter fits entirely inside the CHAPTER chunk, so its text is already
  // indexed. Emitting an identical SCENE chunk would embed the same text twice.
  it("does not duplicate an undersized chapter already covered by the chapter chunk", () => {
    const brief = "짧은 도입부.";

    expect(chunkChapter(brief)).toEqual([
      { type: "CHAPTER", content: brief, position: 0 },
    ]);
  });

  it("classifies dialogue-heavy chunks as DIALOGUE", () => {
    const dialogue = [
      '"검은 서고로 가야 해."',
      '"문이 열리면 돌아올 수 없어."',
      '"그래도 단서를 확인해야 해."',
      "리엔은 대답 대신 고개를 끄덕였다.",
    ].join("\n");
    const content = `${dialogue}\n`.repeat(16);

    const chunks = chunkChapter(content);

    expect(chunks[1]?.type).toBe("DIALOGUE");
  });
});
