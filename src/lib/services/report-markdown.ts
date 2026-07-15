import type { ReportData } from "./report.service";
import { formatDate, formatRange } from "./report-markdown/helpers";
import {
  renderRiskSection,
  renderDecisionQuestions,
  renderOverview,
  renderAnalysisJobs,
  renderChapterSummary,
  renderEntitySnapshot
} from "./report-markdown/sections-a";
import {
  renderActionChecklist,
  renderConflictPlaceholder,
  renderEvidence,
  renderFixedFactsPlaceholder,
  renderForeshadows,
  renderKnowledgeStatePlaceholder,
  renderRelations,
  renderSubmissionReadinessPlaceholder,
  renderSuggestions,
  renderTimelinePlaceholder
} from "./report-markdown/sections-b";

export interface ReportMarkdownOptions {
  generatedAt?: Date;
  includeOperatorNotes?: boolean;
}

export function renderReportMarkdown(
  data: ReportData,
  options: ReportMarkdownOptions = {}
): string {
  const includeOperatorNotes = options.includeOperatorNotes ?? true;
  const generatedAt = options.generatedAt ?? new Date();
  const lines: string[] = [];

  lines.push(`# 작품 기억 진단 리포트 초안`);
  lines.push("");
  lines.push(`작성일: ${formatDate(generatedAt)}`);
  lines.push(`작품명: ${data.project.title}`);
  lines.push(`장르: ${data.project.genre || "미정"}`);
  lines.push(`분석 범위: ${formatRange(data)}`);
  lines.push("");
  lines.push(
    "> 이 문서는 운영자 검수용 초안입니다. 자동으로 모은 작품 데이터와 사람이 편집해야 할 판단 영역을 구분합니다."
  );
  lines.push("");

  lines.push(...renderRiskSection(data, includeOperatorNotes));
  lines.push(...renderDecisionQuestions(includeOperatorNotes));
  lines.push(...renderOverview(data));
  lines.push(...renderAnalysisJobs(data, includeOperatorNotes));
  lines.push(...renderChapterSummary(data, includeOperatorNotes));
  lines.push(...renderEntitySnapshot(data, includeOperatorNotes));
  lines.push(...renderFixedFactsPlaceholder(includeOperatorNotes));
  lines.push(...renderTimelinePlaceholder(data, includeOperatorNotes));
  lines.push(...renderKnowledgeStatePlaceholder(includeOperatorNotes));
  lines.push(...renderSuggestions(data, includeOperatorNotes));
  lines.push(...renderRelations(data, includeOperatorNotes));
  lines.push(...renderConflictPlaceholder(includeOperatorNotes));
  lines.push(...renderForeshadows(data, includeOperatorNotes));
  lines.push(...renderSubmissionReadinessPlaceholder(includeOperatorNotes));
  lines.push(...renderEvidence(data, includeOperatorNotes));
  lines.push(...renderActionChecklist(includeOperatorNotes));

  return `${lines.join("\n").trim()}\n`;
}
