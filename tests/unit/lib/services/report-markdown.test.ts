import { describe, expect, it } from "vitest";
import type { ReportData } from "@/lib/services/report.service";
import { renderReportMarkdown } from "@/lib/services/report-markdown";

const baseDate = new Date("2026-05-18T00:00:00+09:00");

function sampleReportData(): ReportData {
  return {
    project: {
      id: "project-1",
      title: "달빛 아래 검은 탑",
      genre: "판타지",
      description: null,
      excluded_terms: null,
      metadata: null,
      user_id: "user-1",
      created_at: "2026-05-18T00:00:00+09:00",
      updated_at: "2026-05-18T00:00:00+09:00",
    },
    range: {
      chapterFrom: 1,
      chapterTo: 3,
    },
    stats: {
      chapterCount: 1,
      totalWordCount: 1200,
      totalCharCount: 3000,
      entityCount: 1,
      entityCountsByType: {
        CHARACTER: 1,
      },
      suggestionCountsByStatus: {
        PENDING: 1,
      },
      foreshadowCountsByStatus: {
        PLANTED: 1,
      },
      relationCount: 1,
    },
    chapters: [
      {
        id: "chapter-1",
        project_id: "project-1",
        chapter_num: 1,
        title: "입학식의 밤",
        content: "이안은 북쪽 탑에서 푸른 빛을 보았다.",
        summary: "이안이 왕립 아카데미 입학식 후 북쪽 탑의 빛을 본다.",
        arc_summary: null,
        word_count: 1200,
        created_at: "2026-05-18T00:00:00+09:00",
        updated_at: "2026-05-18T00:00:00+09:00",
        charCount: 3000,
        excerpt: "이안은 북쪽 탑에서 푸른 빛을 보았다.",
      },
    ],
    entities: [
      {
        id: "entity-1",
        project_id: "project-1",
        name: "이안",
        type: "CHARACTER",
        summary: "빛의 마력에 민감한 주인공.",
        aliases: null,
        embedding: null,
        metadata: null,
        created_at: "2026-05-18T00:00:00+09:00",
        updated_at: "2026-05-18T00:00:00+09:00",
        firstMentionChapterNum: 1,
        mentionCount: 2,
        evidence: [
          {
            entityId: "entity-1",
            chapterId: "chapter-1",
            chapterNum: 1,
            chapterTitle: "입학식의 밤",
            chunkId: "chunk-1",
            chunkPosition: 1,
            chunkType: "SCENE",
            mentionCount: 2,
            snippet: "이안은 북쪽 탑에서 푸른 빛을 보았다.",
          },
        ],
      },
    ],
    entityLinks: [
      {
        id: "link-1",
        from_id: "entity-1",
        to_id: "entity-2",
        relation_type: "USES",
        direction: "UNI",
        weight: 0.7,
        description: "이안이 은빛 열쇠를 사용한다.",
        created_at: "2026-05-18T00:00:00+09:00",
        from: {
          id: "entity-1",
          name: "이안",
          type: "CHARACTER",
        },
        to: {
          id: "entity-2",
          name: "은빛 열쇠",
          type: "ITEM",
        },
      },
    ],
    suggestions: [
      {
        id: "suggestion-1",
        project_id: "project-1",
        chapter_id: "chapter-1",
        name: "검은 탑",
        type: "PLACE",
        summary: "봉인된 장소.",
        aliases: null,
        confidence: 0.8,
        context_snippet: "검은 탑의 문양이 빛났다.",
        matched_entity_id: null,
        status: "PENDING",
        suggested_action: "CREATE",
        created_at: "2026-05-18T00:00:00+09:00",
        updated_at: "2026-05-18T00:00:00+09:00",
        chapter: {
          id: "chapter-1",
          chapter_num: 1,
          title: "입학식의 밤",
        },
        matchedEntity: null,
      },
    ],
    foreshadows: [
      {
        id: "foreshadow-1",
        project_id: "project-1",
        description: "이안이 푸른 빛에 반응한다.",
        planted_chapter: 1,
        expected_reveal: 5,
        status: "PLANTED",
        entity_ids: ["entity-1"],
        created_at: "2026-05-18T00:00:00+09:00",
        updated_at: "2026-05-18T00:00:00+09:00",
        entities: [
          {
            id: "entity-1",
            name: "이안",
            type: "CHARACTER",
          },
        ],
      },
    ],
    analysisJobs: [
      {
        id: "job-1",
        project_id: "project-1",
        chapter_id: "chapter-1",
        status: "DONE",
        entity_count: 3,
        relation_count: 1,
        suggestion_count: 2,
        error: null,
        started_at: "2026-05-18T00:00:00+09:00",
        finished_at: "2026-05-18T00:01:00+09:00",
        created_at: "2026-05-18T00:00:00+09:00",
        updated_at: "2026-05-18T00:01:00+09:00",
        chapter: {
          id: "chapter-1",
          chapter_num: 1,
          title: "입학식의 밤",
        },
      },
    ],
  };
}

describe("renderReportMarkdown", () => {
  it("renders a report draft with data-backed sections", () => {
    const markdown = renderReportMarkdown(sampleReportData(), {
      generatedAt: baseDate,
    });

    expect(markdown).toContain("# 작품 기억 진단 리포트 초안");
    expect(markdown).toContain("작품명: 달빛 아래 검은 탑");
    expect(markdown).toContain("## 1. 한눈에 보는 핵심 리스크");
    expect(markdown).toContain("## 4. 분석 처리 상태");
    expect(markdown).toContain("| 1화 | 입학식의 밤 | 완료 | 3 | 1 | 2 | - |");
    expect(markdown).toContain("## 5. 회차별 기억 요약");
    expect(markdown).toContain("| 공백 제외 글자 수 | 1,200자 |");
    expect(markdown).toContain("- 공백 제외 글자 수: 1,200자");
    expect(markdown).toContain("작품 기억 항목은 분석 회차 범위가 아니라 작품 전체 기준입니다.");
    expect(markdown).toContain("| 장소 | 검은 탑 | 1화 | 확인 필요 | 신규/미연결 | 봉인된 장소. |");
    expect(markdown).toContain("| 이안 | 1화 | 2회 | 빛의 마력에 민감한 주인공. |");
    expect(markdown).toContain("| 이안 | 사용 | 은빛 열쇠 | 이안이 은빛 열쇠를 사용한다. |");
    expect(markdown).toContain("| 이안이 푸른 빛에 반응한다. | 1화 | 5화 | 심음 | 이안 |");
  });

  it("can hide operator notes for author-facing previews", () => {
    const markdown = renderReportMarkdown(sampleReportData(), {
      generatedAt: baseDate,
      includeOperatorNotes: false,
    });

    expect(markdown).not.toContain("운영 메모:");
    expect(markdown).toContain("## 16. 작가 액션 체크리스트");
  });
});
