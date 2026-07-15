import type { DetectConflictsResult, InlineWarning } from "@/types";
import type { AIConflict } from "@/types/ai-analysis";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * DB detect_conflicts 결과를 InlineWarning[]으로 변환.
 * entity_name을 본문에서 검색하여 matchedText로 사용.
 */
export function dbConflictsToWarnings(
  conflicts: DetectConflictsResult[],
  content: string
): InlineWarning[] {
  const warnings: InlineWarning[] = [];

  for (const c of conflicts) {
    const name = c.entity_name;
    if (!name || name.length < 2) continue;

    const regex = new RegExp(escapeRegex(name), "g");
    let match: RegExpExecArray | null;

    // 본문에서 entity_name이 등장하는 모든 위치에 경고 생성
    let found = false;
    while ((match = regex.exec(content)) !== null) {
      found = true;
      warnings.push({
        id: `db-${c.entity_id}-${match.index}`,
        severity: "medium",
        type: c.conflict_type,
        entityName: c.entity_name,
        detail: c.detail,
        matchedText: match[0],
        source: "db",
      });
      // 첫 번째 매치만 사용 (중복 하이라이트 방지)
      break;
    }

    // 본문에 entity_name이 없으면 경고 생략 (인라인 표시 불가)
    if (!found) {
      warnings.push({
        id: `db-${c.entity_id}-nopos`,
        severity: "medium",
        type: c.conflict_type,
        entityName: c.entity_name,
        detail: c.detail,
        matchedText: c.entity_name,
        source: "db",
      });
    }
  }

  return warnings;
}

/**
 * AI 분석 충돌을 InlineWarning[]으로 변환.
 * matchedText 우선, 없으면 entity로 fallback.
 */
export function aiConflictsToWarnings(
  conflicts: AIConflict[],
  content: string
): InlineWarning[] {
  const warnings: InlineWarning[] = [];

  for (let i = 0; i < conflicts.length; i++) {
    const c = conflicts[i];
    let matchedText = c.matchedText;

    // matchedText가 없으면 entity 이름으로 fallback
    if (!matchedText || !content.includes(matchedText)) {
      if (c.entity && c.entity.length >= 2 && content.includes(c.entity)) {
        matchedText = c.entity;
      } else {
        // 본문에서 찾을 수 없으면 인라인 표시 불가
        continue;
      }
    }

    warnings.push({
      id: `ai-${i}-${matchedText.slice(0, 20)}`,
      severity: c.severity,
      type: c.type,
      entityName: c.entity,
      detail: c.detail,
      suggestion: c.suggestion,
      matchedText,
      source: "ai",
    });
  }

  return warnings;
}

/**
 * source별로 경고 병합 (db/ai 공존 가능).
 * 동일 source의 기존 경고는 교체, 다른 source는 유지.
 */
export function mergeWarnings(
  prev: InlineWarning[],
  next: InlineWarning[],
  source: "db" | "ai"
): InlineWarning[] {
  const kept = prev.filter((w) => w.source !== source);
  return [...kept, ...next];
}
