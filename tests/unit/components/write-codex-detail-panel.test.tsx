import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CodexDetailPanel } from "@/components/write/codex-detail-panel";
import type { EnrichedEntity } from "@/components/write/codex-panel-types";

function entity(overrides: Partial<EnrichedEntity> = {}): EnrichedEntity {
  return {
    id: "entity-1",
    name: "리엔",
    type: "CHARACTER",
    summary: "변방 마을의 영주.",
    aliases: [],
    links: [],
    chapters: [],
    facts: [],
    ...overrides,
  };
}

function render(entityValue: EnrichedEntity) {
  return renderToStaticMarkup(
    <CodexDetailPanel
      entity={entityValue}
      onClose={vi.fn()}
      onFieldSave={vi.fn()}
      onDeleteLink={vi.fn()}
      onDelete={vi.fn()}
      isPending={false}
    />
  );
}

describe("write CodexDetailPanel facts", () => {
  it("shows approved facts and compact source evidence for the selected entity", () => {
    const html = render(
      entity({
        facts: [
          {
            id: "fact-1",
            entityId: "entity-1",
            factType: "ATTRIBUTE",
            factKey: "species",
            value: "하이엘프다",
            status: "APPROVED",
            confidence: 0.91,
            establishedChapterId: "chapter-1",
            establishedChapterNum: 1,
            approvedAt: "2026-05-27T00:00:00.000Z",
            sources: [
              {
                id: "source-1",
                chapterId: "chapter-2",
                chapterNum: 2,
                chapterTitle: "정체",
                chunkId: "chunk-1",
                evidenceText: "리엔은 하이엘프라고 소개됐다.",
                evidenceKind: "DIRECT",
              },
            ],
          },
        ],
      })
    );

    expect(html).toContain("승인된 설정");
    expect(html).toContain("1개");
    expect(html).toContain("속성");
    expect(html).toContain("하이엘프다");
    expect(html).toContain("2화 · 정체 근거");
    expect(html).toContain("리엔은 하이엘프라고 소개됐다.");
  });

  it("summarizes hidden sources when an approved fact has more than two sources", () => {
    const html = render(
      entity({
        facts: [
          {
            id: "fact-1",
            entityId: "entity-1",
            factType: "ROLE",
            factKey: "title",
            value: "변방 마을의 영주다",
            status: "APPROVED",
            confidence: 0.9,
            establishedChapterId: "chapter-1",
            establishedChapterNum: 1,
            approvedAt: "2026-05-27T00:00:00.000Z",
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
                chapterTitle: "새 근거",
                chunkId: "chunk-2",
                evidenceKind: "DIRECT",
                evidenceText: "다른 회차에서도 영주라고 불렸다.",
              },
              {
                id: "source-3",
                chapterId: "chapter-3",
                chapterNum: 3,
                chapterTitle: "회의",
                chunkId: "chunk-3",
                evidenceKind: "DIRECT",
                evidenceText: "회의에서 직책이 다시 언급됐다.",
              },
            ],
          },
        ],
      })
    );

    expect(html).toContain("title");
    expect(html).toContain("1화 · 첫 만남 근거 외 2개");
    expect(html).toContain("1화 · 첫 만남 근거:");
    expect(html).toContain("2화 · 새 근거:");
    expect(html).toContain("근거 1개 더 있음");
    expect(html).not.toContain("회의에서 직책이 다시 언급됐다.");
  });

  it("falls back to the established chapter when a fact has no source rows", () => {
    const html = render(
      entity({
        facts: [
          {
            id: "fact-1",
            entityId: "entity-1",
            factType: "ROLE",
            factKey: "current_position",
            value: "변방 마을의 영주다",
            status: "APPROVED",
            confidence: 0.9,
            establishedChapterId: "chapter-3",
            establishedChapterNum: 3,
            approvedAt: null,
            sources: [],
          },
        ],
      })
    );

    expect(html).toContain("역할");
    expect(html).toContain("변방 마을의 영주다");
    expect(html).toContain("3화 근거");
    expect(html).not.toContain("근거 원문 없음");
  });

  it("keeps compact fact styling on design tokens instead of hard-coded legacy colors", () => {
    const html = render(
      entity({
        facts: [
          {
            id: "fact-1",
            entityId: "entity-1",
            factType: "STATE",
            factKey: "current_status",
            value: "누명을 쓴 상태다",
            status: "APPROVED",
            confidence: 0.82,
            establishedChapterId: "chapter-1",
            establishedChapterNum: 1,
            approvedAt: null,
            sources: [],
          },
        ],
      })
    );

    expect(html).toContain("var(--sw-bg-raised)");
    expect(html).toContain("var(--sw-border-default)");
    expect(html).toContain("var(--sw-text-secondary)");
    expect(html).not.toContain("#0f172a");
    expect(html).not.toContain("#1e293b");
  });
});
