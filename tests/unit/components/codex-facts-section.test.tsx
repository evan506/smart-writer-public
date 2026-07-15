import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FactsSection } from "@/components/codex-detail-panel/facts-section";
import type { CodexFact } from "@/lib/services/canon-facts/read.service";

function fact(overrides: Partial<CodexFact> = {}): CodexFact {
  return {
    id: "fact-1",
    entityId: "entity-1",
    factType: "ROLE",
    factKey: "title",
    value: "변방 마을의 영주",
    status: "APPROVED",
    confidence: 0.9,
    establishedChapterId: "chapter-1",
    establishedChapterNum: 1,
    approvedAt: "2026-05-26T00:00:00.000Z",
    sources: [],
    ...overrides,
  };
}

describe("Codex FactsSection", () => {
  it("renders up to three fact source excerpts and summarizes hidden sources", () => {
    const html = renderToStaticMarkup(
      <FactsSection
        facts={[
          fact({
            sources: [
              {
                id: "source-1",
                chapterId: "chapter-1",
                chapterNum: 1,
                chapterTitle: "첫 만남",
                chunkId: "chunk-1",
                evidenceKind: "DIRECT",
                evidenceText: "리엔은 변방 마을의 영주로 불렸다.",
              },
              {
                id: "source-2",
                chapterId: "chapter-2",
                chapterNum: 2,
                chapterTitle: "마을",
                chunkId: "chunk-2",
                evidenceKind: "DIRECT",
                evidenceText: "영주는 마을의 방어를 맡았다.",
              },
              {
                id: "source-3",
                chapterId: "chapter-3",
                chapterNum: 3,
                chapterTitle: "회의",
                chunkId: "chunk-3",
                evidenceKind: "DIRECT",
                evidenceText: "회의에서 리엔의 직책이 다시 언급됐다.",
              },
              {
                id: "source-4",
                chapterId: "chapter-4",
                chapterNum: 4,
                chapterTitle: "추가 근거",
                chunkId: "chunk-4",
                evidenceKind: "DIRECT",
                evidenceText: "네 번째 근거는 접힌 개수로만 표시된다.",
              },
            ],
          }),
        ]}
      />
    );

    expect(html).toContain("변방 마을의 영주");
    expect(html).toContain("1화 · 첫 만남 근거 외 3개");
    expect(html).toContain("리엔은 변방 마을의 영주로 불렸다.");
    expect(html).toContain("영주는 마을의 방어를 맡았다.");
    expect(html).toContain("회의에서 리엔의 직책이 다시 언급됐다.");
    expect(html).toContain("근거 1개 더 있음");
    expect(html).not.toContain("네 번째 근거는 접힌 개수로만 표시된다.");
  });

  it("keeps established chapter fallback when a fact has no source rows", () => {
    const html = renderToStaticMarkup(<FactsSection facts={[fact()]} />);

    expect(html).toContain("1화 근거");
    expect(html).not.toContain("근거 원문 없음");
  });
});
