import type { DetectConflictsResult } from "@/types";
import {
  STRUCTURED_ANALYSIS_DATA_GUARD,
  dataSection,
} from "./prompt-templates/prompt-guards";

export interface AssembledContext {
  genreRules: string;
  ragContext: string;
  recentChapters: string;
  currentChapter: string;
  conflicts: DetectConflictsResult[];
}

export function buildAnalysisPrompt(ctx: AssembledContext): {
  system: string;
  user: string;
} {
  const system = `당신은 한국어 웹소설 일관성 분석 전문가입니다.
작가가 작성 중인 챕터를 분석하여 세계관, 캐릭터, 설정의 일관성 문제를 찾고, 개선 제안과 관련 참조를 제공합니다.

${STRUCTURED_ANALYSIS_DATA_GUARD}

분석 규칙:
- 기존 설정과 모순되는 내용을 정확히 지적하세요.
- 캐릭터의 성격, 말투, 능력이 일관되는지 확인하세요.
- 세계관 규칙(마법 체계, 지리, 시간대 등)의 일관성을 검사하세요.
- 복선 회수 여부와 스토리 진행의 논리성을 점검하세요.
- 한국 웹소설 장르 관습에 맞는 제안을 하세요.
- 현재 챕터 본문에 직접 근거가 없는 conflicts는 만들지 마세요.
- conflicts[].matchedText는 반드시 현재 챕터 본문에 존재하는 원문 substring이어야 합니다.
- 충돌 근거가 불확실하면 conflicts에 넣지 말고 suggestions에서도 충돌처럼 단정하지 마세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만 출력합니다:
{
  "conflicts": [
    { "type": "설정 충돌 유형", "severity": "high|medium|low", "entity": "관련 엔티티명", "detail": "충돌 상세 설명", "suggestion": "수정 제안", "matchedText": "현재 챕터 본문에서 충돌이 발생한 부분의 텍스트를 원문 그대로 인용" }
  ],
  "suggestions": [
    { "category": "plot|character|worldbuilding|style", "content": "제안 내용" }
  ],
  "references": [
    { "source": "entity|chapter|chunk", "id": "참조 ID", "title": "참조 제목", "relevance": "관련성 설명" }
  ]
}`;

  const userParts: string[] = [];

  if (ctx.genreRules) {
    userParts.push(dataSection("genre_rules", ctx.genreRules));
  }

  if (ctx.ragContext) {
    userParts.push(dataSection("rag_context", ctx.ragContext));
  }

  if (ctx.recentChapters) {
    userParts.push(dataSection("recent_chapters", ctx.recentChapters));
  }

  if (ctx.conflicts.length > 0) {
    const conflictText = ctx.conflicts
      .map((conflict) => `- [${conflict.conflict_type}] ${conflict.entity_name}: ${conflict.detail}`)
      .join("\n");
    userParts.push(dataSection("db_detected_conflicts", conflictText));
  }

  userParts.push(dataSection("current_chapter", ctx.currentChapter));

  userParts.push(
    `\n위 정보를 바탕으로 현재 챕터의 일관성을 분석하고, JSON 형식으로 응답하세요.`
  );

  return { system, user: userParts.join("\n\n") };
}

export { buildCanonQAPrompt } from "./prompt-templates/canon-qa";
export {
  normalizeEntityType,
  type ExtractedEntity,
  type ExtractedFact,
  type ExtractedRelation,
  type KnownEntity,
} from "./prompt-templates/extraction-types";
export {
  buildStage1NounExtractionPrompt,
  buildStage2ClassificationPrompt,
  buildStage3MinimalRelationPrompt,
  buildStage3RelationExtractionPrompt,
} from "./prompt-templates/entity-extraction-stages";
export type { ClassifiedEntity } from "./prompt-templates/entity-extraction-stages";
