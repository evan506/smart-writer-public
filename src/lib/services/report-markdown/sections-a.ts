import type { ReportData } from "../report.service";
import { ANALYSIS_JOB_STATUS_LABELS, ENTITY_TYPE_LABELS, FORESHADOW_STATUS_LABELS, SUGGESTION_STATUS_LABELS } from "./labels";
import {
  formatCounts,
  formatRange,
  groupBy,
  label,
  operatorNote,
  table,
} from "./helpers";

export function renderRiskSection(
  data: ReportData,
  includeOperatorNotes: boolean
): string[] {
  const pendingCount = data.suggestions.filter((item) => item.status === "PENDING").length;
  const unknownForeshadows = data.foreshadows.filter(
    (item) => item.status !== "REVEALED"
  ).length;
  const relationCount = data.entityLinks.length;

  const rows = [
    [
      "확인 필요",
      `확인 대기 설정 ${pendingCount}개`,
      pendingCount > 0
        ? "작가가 확정해야 작품 기억에 안정적으로 쌓입니다."
        : "현재 확인 대기 설정은 없습니다.",
      pendingCount > 0 ? "대기 항목을 검토하고 병합/확정/넘김 처리" : "다음 분석 결과 확인",
    ],
    [
      "관계",
      `관계 ${relationCount}개`,
      relationCount > 0
        ? "인물/조직/장소 관계는 장기 연재의 기억 비용을 줄입니다."
        : "아직 등록된 관계가 없습니다.",
      relationCount > 0 ? "핵심 관계만 우선 검수" : "주요 인물 관계 수동 확인",
    ],
    [
      "복선",
      `미회수/진행 복선 ${unknownForeshadows}개`,
      unknownForeshadows > 0
        ? "심은 복선과 회수 시점을 함께 관리해야 합니다."
        : "현재 진행 중인 복선은 없습니다.",
      unknownForeshadows > 0 ? "회수 예정 회차와 독자 기억 포인트 확인" : "복선 후보 수동 점검",
    ],
  ];

  return [
    "## 1. 한눈에 보는 핵심 리스크",
    "",
    table(["분류", "현재 상태", "왜 중요한가", "권장 액션"], rows),
    "",
    ...operatorNote(includeOperatorNotes, [
      "명칭 혼재, 시간 순서, 정보 공개 상태 같은 실제 리스크는 운영자가 본문 근거를 보고 추가 판단합니다.",
    ]),
  ];
}

export function renderDecisionQuestions(includeOperatorNotes: boolean): string[] {
  return [
    "## 2. 작가가 지금 결정해야 할 질문",
    "",
    "1. 같은 인물/장소/아이템이 여러 이름으로 등장한 항목이 있나요?",
    "2. 핵심 설정 중 바뀌면 안 되는 고정 사실은 무엇인가요?",
    "3. 독자와 주요 인물이 각각 어디까지 알고 있나요?",
    "4. 심어둔 복선 중 다음 3-5화 안에 다시 언급해야 할 항목이 있나요?",
    "5. 공모전/투고용 시놉시스와 캐릭터 설정으로 옮길 핵심 항목은 무엇인가요?",
    "",
    ...operatorNote(includeOperatorNotes, [
      "이 질문은 자동 확정하지 않습니다. 운영자가 작품별 리스크에 맞게 줄이거나 바꿉니다.",
    ]),
  ];
}

export function renderOverview(data: ReportData): string[] {
  const rows = [
    ["작품명", data.project.title],
    ["장르", data.project.genre || "미정"],
    ["분석 회차", formatRange(data)],
    ["회차 수", `${data.stats.chapterCount}개`],
    ["총 글자 수", `${data.stats.totalCharCount.toLocaleString("ko-KR")}자`],
    ["공백 제외 글자 수", `${data.stats.totalWordCount.toLocaleString("ko-KR")}자`],
    ["작품 기억 항목", `${data.stats.entityCount}개`],
    ["확인 후보", formatCounts(data.stats.suggestionCountsByStatus, SUGGESTION_STATUS_LABELS)],
    ["복선", formatCounts(data.stats.foreshadowCountsByStatus, FORESHADOW_STATUS_LABELS)],
    ["관계", `${data.stats.relationCount}개`],
  ];

  return ["## 3. 작품 개요", "", table(["항목", "내용"], rows), ""];
}

export function renderAnalysisJobs(
  data: ReportData,
  includeOperatorNotes: boolean
): string[] {
  const rows = data.analysisJobs.map((job) => [
    job.chapter ? `${job.chapter.chapter_num}화` : "미확인",
    job.chapter?.title || "제목 없음",
    label(ANALYSIS_JOB_STATUS_LABELS, job.status),
    `${job.entity_count ?? 0}`,
    `${job.relation_count ?? 0}`,
    `${job.suggestion_count ?? 0}`,
    job.error || "-",
  ]);

  return [
    "## 4. 분석 처리 상태",
    "",
    rows.length > 0
      ? table(
          ["회차", "제목", "상태", "엔티티", "관계", "제안", "오류"],
          rows
        )
      : "_분석 작업 기록이 없습니다._",
    "",
    ...operatorNote(includeOperatorNotes, [
      "분석 실패 회차가 있으면 리포트 품질에 영향을 줄 수 있으므로 먼저 재분석 여부를 확인합니다.",
    ]),
  ];
}

export function renderChapterSummary(
  data: ReportData,
  includeOperatorNotes: boolean
): string[] {
  const lines = ["## 5. 회차별 기억 요약", ""];

  if (data.chapters.length === 0) {
    lines.push("_분석 범위에 포함된 회차가 없습니다._", "");
    return lines;
  }

  for (const chapter of data.chapters) {
    const suggestions = data.suggestions.filter(
      (item) => item.chapter?.id === chapter.id
    );

    lines.push(`### ${chapter.chapter_num}화. ${chapter.title || "제목 없음"}`);
    lines.push("");
    lines.push(`- 글자 수: ${chapter.charCount.toLocaleString("ko-KR")}자`);
    lines.push(
      `- 공백 제외 글자 수: ${(chapter.word_count ?? 0).toLocaleString("ko-KR")}자`
    );
    lines.push(`- 확인 후보: ${suggestions.length}개`);
    if (chapter.summary) lines.push(`- 저장된 요약: ${chapter.summary}`);
    if (chapter.arc_summary) lines.push(`- 흐름 요약: ${chapter.arc_summary}`);
    if (chapter.excerpt) lines.push(`- 본문 앞부분: ${chapter.excerpt}`);
    lines.push("");
    lines.push("이번 화에서 기억할 설정 후보:");
    lines.push("");
    lines.push(
      suggestions.length > 0
        ? table(
            ["유형", "이름", "상태", "기억할 내용"],
            suggestions.map((item) => [
              label(ENTITY_TYPE_LABELS, item.type),
              item.name,
              label(SUGGESTION_STATUS_LABELS, item.status),
              item.summary || item.context_snippet || "운영자 확인 필요",
            ])
          )
        : "_자동으로 연결된 설정 후보가 없습니다. 운영자 확인이 필요합니다._"
    );
    lines.push("");
  }

  lines.push(
    ...operatorNote(includeOperatorNotes, [
      "핵심 사건 요약과 다음 회차에서 다시 확인할 포인트는 운영자가 본문을 읽고 보강합니다.",
    ])
  );
  return lines;
}

export function renderEntitySnapshot(
  data: ReportData,
  includeOperatorNotes: boolean
): string[] {
  const lines = [
    "## 6. 작품 기억 스냅샷",
    "",
    "> 작품 기억 항목은 분석 회차 범위가 아니라 작품 전체 기준입니다. 첫 등장/등장 근거는 선택한 분석 범위 안에서 확인된 근거만 반영될 수 있습니다.",
    "",
  ];
  const grouped = groupBy(data.entities, (entity) => entity.type);

  if (data.entities.length === 0) {
    lines.push("_작품 기억에 등록된 항목이 없습니다._", "");
    return lines;
  }

  for (const [type, entities] of Object.entries(grouped).sort()) {
    lines.push(`### ${label(ENTITY_TYPE_LABELS, type)}`);
    lines.push("");
    lines.push(
      table(
        ["이름", "첫 등장", "등장 근거", "현재 기억"],
        entities.map((entity) => [
          entity.name,
          entity.firstMentionChapterNum
            ? `${entity.firstMentionChapterNum}화`
            : "미확인",
          `${entity.mentionCount}회`,
          entity.summary || "운영자 설명 보강 필요",
        ])
      )
    );
    lines.push("");
  }

  lines.push(
    ...operatorNote(includeOperatorNotes, [
      "역할, 중요도, 고정 사실/변화 가능 상태는 자동 목록을 바탕으로 운영자가 분리합니다.",
    ])
  );
  return lines;
}
