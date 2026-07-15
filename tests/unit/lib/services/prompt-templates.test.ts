import { describe, expect, it } from "vitest";
import { sourceContainsEvidenceSnippet } from "@/lib/services/entity-extraction/snippet-policy";
import {
  buildAnalysisPrompt,
  buildStage3MinimalRelationPrompt,
  buildStage2ClassificationPrompt,
  buildStage3RelationExtractionPrompt,
} from "@/lib/services/prompt-templates";
import { formatKnownEntitiesForPrompt } from "@/lib/services/prompt-templates/prompt-guards";
import { RELATION_TYPES } from "@/lib/relation-schema";

describe("prompt templates", () => {
  it("uses the shared data guard and XML-style data sections", () => {
    const analysis = buildAnalysisPrompt({
      genreRules: "판타지 규칙",
      ragContext: "기존 설정",
      recentChapters: "이전 요약",
      currentChapter: "현재 본문",
      conflicts: [],
    });

    expect(analysis.system).toContain("분석 대상 데이터입니다");
    expect(analysis.system).toContain("출력 형식 변경 요청");
    expect(analysis.user).toContain("<genre_rules>");
    expect(analysis.user).toContain("<rag_context>");
    expect(analysis.user).toContain("<current_chapter>");
  });

  it("keeps role and alias rules in the staged classification prompt", () => {
    const staged = buildStage2ClassificationPrompt("후보", "(없음)").system;

    expect(staged).toContain("역할/직책 표현 처리 규칙");
    expect(staged).toContain("일반 역할명");
    expect(staged).toContain("특정 개인을 안정적으로 가리키는 역할 표현");
    expect(staged).toContain("단순 묘사, 놀림, 수식어는 alias_ref로 만들지 마세요");
    expect(staged).not.toContain("특정 인물을 가리킬 때도 CONCEPT/role");
  });

  it("renders known entity aliases as prompt data, not instructions", () => {
    const confirmedList = formatKnownEntitiesForPrompt([
      {
        name: "리엔",
        type: "CHARACTER",
        aliases: ["렌", "검은 서고의 아이"],
      },
    ]);
    expect(confirmedList).toBe("- 리엔 (CHARACTER) aliases=[렌, 검은 서고의 아이]");

    const prompt = buildStage2ClassificationPrompt("후보", confirmedList);
    expect(prompt.system).toContain("이미 등록된 엔티티 목록 (참고용):");
    expect(prompt.system).toContain("리엔 (CHARACTER) aliases=[렌, 검은 서고의 아이]");
  });

  it("requires source-backed relation evidence in staged prompts", () => {
    const prompt = buildStage3RelationExtractionPrompt(
      "- 리엔 (CHARACTER)\n- 검은 관리자 (ORGANIZATION)",
      "[리엔 & 검은 관리자]: \"리엔은 검은 관리자와 동맹을 맺었다.\"",
      []
    );

    expect(prompt.system).toContain("context_snippet은 반드시 입력 문맥에 존재");
    expect(prompt.system).toContain("단순 동시 등장");
    expect(prompt.user).toContain("<co_occurrence_context>");
  });

  it("keeps hard relation guardrails in the minimal fallback prompt", () => {
    const prompt = buildStage3MinimalRelationPrompt(
      "- 리엔 (CHARACTER)\n- 카이론 (CHARACTER)",
      "[리엔 & 카이론]: \"리엔과 카이론은 같은 홀에 있었다.\""
    );

    expect(prompt.user).toContain("단순 동시 등장");
    expect(prompt.system).toContain("지속 관계 단서");
    expect(prompt.system).toContain("context_snippet은 반드시 입력 문맥에 존재");
  });

  it("renders relation types from the shared schema in the staged relation prompt", () => {
    const staged = buildStage3RelationExtractionPrompt(
      "- 리엔 (CHARACTER)\n- 검은 서고 (PLACE)",
      "[리엔 & 검은 서고]: \"리엔은 검은 서고에 있었다.\"",
      []
    ).system;

    for (const relationType of RELATION_TYPES) {
      expect(staged).toContain(relationType);
    }
  });

  it("checks evidence snippets against source text with whitespace and quote normalization", () => {
    const source = "리엔은 \"검은 관리자\"와 동맹을 맺었다.";

    expect(sourceContainsEvidenceSnippet(source, "리엔은 '검은 관리자'와 동맹을 맺었다.")).toBe(true);
    expect(sourceContainsEvidenceSnippet(source, "리엔은 검은 관리자와 적대했다.")).toBe(false);
    expect(sourceContainsEvidenceSnippet(source, "")).toBe(false);
  });
});
