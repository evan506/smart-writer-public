import type { ReportData } from "../report.service";
import { ENTITY_TYPE_LABELS, FORESHADOW_STATUS_LABELS, RELATION_TYPE_LABELS, SUGGESTION_STATUS_LABELS } from "./labels";
import { label, operatorNote, table } from "./helpers";

export function renderFixedFactsPlaceholder(includeOperatorNotes: boolean): string[] {
  return [
    "## 7. 고정 사실 / 변화 가능 상태",
    "",
    table(
      ["항목", "고정 사실", "변화 가능 상태", "주의"],
      [
        [
          "운영자 작성 필요",
          "바뀌면 설정 충돌이 되는 사실",
          "서사 진행에 따라 변해도 되는 감정/관계/상태",
          "작품 기억 기준 확정 필요",
        ],
      ]
    ),
    "",
    ...operatorNote(includeOperatorNotes, [
      "이 섹션은 자동 확정하지 않습니다. 엔티티 요약과 근거 장면을 보고 운영자가 작성합니다.",
    ]),
  ];
}

export function renderTimelinePlaceholder(
  data: ReportData,
  includeOperatorNotes: boolean
): string[] {
  return [
    "## 8. 타임라인 / 사건 순서 점검",
    "",
    table(
      ["순서", "회차", "사건", "시간/인과 점검"],
      data.chapters.map((chapter, index) => [
        `${index + 1}`,
        `${chapter.chapter_num}화`,
        chapter.summary || chapter.title || "운영자 사건 요약 필요",
        "시간 경과, 이동, 인과 관계 확인 필요",
      ])
    ),
    "",
    ...operatorNote(includeOperatorNotes, [
      "현재는 회차 순서와 저장된 요약만 자동 배치합니다. 실제 시간 경과와 사건 인과는 운영자 검수가 필요합니다.",
    ]),
  ];
}

export function renderKnowledgeStatePlaceholder(includeOperatorNotes: boolean): string[] {
  return [
    "## 9. 인물별 / 독자별 정보 공개 상태",
    "",
    table(
      ["정보", "주요 인물", "독자", "점검"],
      [
        [
          "운영자 작성 필요",
          "각 인물이 알고 있는 정보",
          "독자에게 공개된 정보",
          "의도된 미스터리인지 설정 누락인지 확인",
        ],
      ]
    ),
    "",
    ...operatorNote(includeOperatorNotes, [
      "정보 공개 상태는 본문 해석 의존도가 높아 자동 판단하지 않습니다.",
    ]),
  ];
}

export function renderSuggestions(
  data: ReportData,
  includeOperatorNotes: boolean
): string[] {
  const pending = data.suggestions.filter((item) => item.status === "PENDING");
  const rows = (pending.length > 0 ? pending : data.suggestions).map((item) => [
    label(ENTITY_TYPE_LABELS, item.type),
    item.name,
    item.chapter ? `${item.chapter.chapter_num}화` : "미확인",
    label(SUGGESTION_STATUS_LABELS, item.status),
    item.matchedEntity ? item.matchedEntity.name : "신규/미연결",
    item.summary || item.context_snippet || "운영자 확인 필요",
  ]);

  return [
    "## 10. 확인 필요한 설정",
    "",
    rows.length > 0
      ? table(["유형", "이름", "회차", "상태", "연결", "내용"], rows)
      : "_확인 후보가 없습니다._",
    "",
    ...operatorNote(includeOperatorNotes, [
      "병합/삭제/확정 판단과 작가에게 물어볼 질문은 운영자가 작성합니다.",
    ]),
  ];
}

export function renderRelations(
  data: ReportData,
  includeOperatorNotes: boolean
): string[] {
  const rows = data.entityLinks.map((link) => [
    link.from?.name ?? link.from_id,
    label(RELATION_TYPE_LABELS, link.relation_type),
    link.to?.name ?? link.to_id,
    link.description || "운영자 해석 필요",
  ]);

  return [
    "## 11. 관계 변화",
    "",
    rows.length > 0
      ? table(["시작", "관계", "대상", "설명"], rows)
      : "_등록된 관계가 없습니다._",
    "",
    ...operatorNote(includeOperatorNotes, [
      "관계의 서사적 중요도와 변화 여부는 운영자 판단이 필요합니다.",
    ]),
  ];
}

export function renderConflictPlaceholder(includeOperatorNotes: boolean): string[] {
  return [
    "## 12. 설정 충돌 / 불일치 후보",
    "",
    table(
      ["심각도", "항목", "충돌 가능성", "권장 처리"],
      [
        [
          "운영자 작성 필요",
          "명칭/시간/관계/규칙 후보",
          "본문 근거 확인 후 작성",
          "작가가 선택할 수 있는 처리 방향 제시",
        ],
      ]
    ),
    "",
    ...operatorNote(includeOperatorNotes, [
      "시스템은 후보를 모을 수 있지만, 실제 충돌 판정은 운영자가 해야 합니다.",
    ]),
  ];
}

export function renderForeshadows(
  data: ReportData,
  includeOperatorNotes: boolean
): string[] {
  const rows = data.foreshadows.map((item) => [
    item.description || "설명 없음",
    `${item.planted_chapter}화`,
    item.expected_reveal ? `${item.expected_reveal}화` : "미정",
    label(FORESHADOW_STATUS_LABELS, item.status ?? "UNKNOWN"),
    item.entities.map((entity) => entity.name).join(", ") || "미연결",
  ]);

  return [
    "## 13. 복선 점검",
    "",
    rows.length > 0
      ? table(["복선", "심은 회차", "회수 예상", "상태", "관련 항목"], rows)
      : "_등록된 복선이 없습니다._",
    "",
    ...operatorNote(includeOperatorNotes, [
      "회수 타이밍, 독자 기억 가능성, 다음 언급 권장은 운영자가 보강합니다.",
    ]),
  ];
}

export function renderSubmissionReadinessPlaceholder(
  includeOperatorNotes: boolean
): string[] {
  return [
    "## 14. 공모전 / 투고 준비도 점검",
    "",
    table(
      ["항목", "현재 상태", "점검", "보강 권장"],
      [
        ["핵심 캐릭터", "자동 목록 기반", "운영자 확인 필요", "목표/비밀/관계 정리"],
        ["세계관 차별점", "작품 기억 기반", "운영자 확인 필요", "규칙과 제한 정리"],
        ["장기 연재 가능성", "자동 판단 불가", "운영자 확인 필요", "장기 갈등 축 정리"],
        ["시놉시스 전환 가능성", "자동 판단 불가", "운영자 확인 필요", "중심 질문과 초반 훅 정리"],
      ]
    ),
    "",
    ...operatorNote(includeOperatorNotes, [
      "공모전/투고 준비도는 제출 목적과 원고 범위에 따라 운영자가 최종 판단합니다.",
    ]),
  ];
}

export function renderEvidence(
  data: ReportData,
  includeOperatorNotes: boolean
): string[] {
  const entitiesWithEvidence = data.entities.filter(
    (entity) => entity.evidence.length > 0
  );
  const rows = entitiesWithEvidence.flatMap((entity) =>
    entity.evidence.map((evidence) => [
      entity.name,
      `${evidence.chapterNum}화`,
      evidence.chapterTitle || "제목 없음",
      evidence.snippet || "근거 스니펫 없음",
    ])
  );

  return [
    "## 15. 작품 안 근거 장면",
    "",
    rows.length > 0
      ? table(["항목", "회차", "제목", "근거"], rows.slice(0, 30))
      : "_연결된 근거 장면이 없습니다._",
    "",
    ...operatorNote(includeOperatorNotes, [
      "작가에게 전달할 때는 긴 원문 인용보다 짧은 근거 요약을 사용합니다.",
    ]),
  ];
}

export function renderActionChecklist(includeOperatorNotes: boolean): string[] {
  return [
    "## 16. 작가 액션 체크리스트",
    "",
    "- [ ] 확인 대기 설정을 확정/병합/넘김 처리한다.",
    "- [ ] 대표 명칭과 별칭을 정리한다.",
    "- [ ] 고정 사실과 변화 가능 상태를 분리한다.",
    "- [ ] 회차 사이 시간 경과와 사건 순서를 확인한다.",
    "- [ ] 인물별/독자별 정보 공개 상태를 확인한다.",
    "- [ ] 다음 3-5화 안에 다시 언급할 복선을 고른다.",
    "- [ ] 공모전/투고용 캐릭터 설정과 시놉시스로 옮길 항목을 정리한다.",
    "",
    ...operatorNote(includeOperatorNotes, [
      "체크리스트는 작품별 리스크에 맞게 줄여서 전달합니다.",
    ]),
  ];
}
