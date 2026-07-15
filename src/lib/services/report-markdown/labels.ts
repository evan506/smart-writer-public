export { RELATION_TYPE_LABELS } from "@/lib/relation-schema";

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  CHARACTER: "인물",
  PLACE: "장소",
  ITEM: "아이템",
  ORGANIZATION: "조직",
  CONCEPT: "개념",
  MAGIC_SYSTEM: "마법체계",
};

export const SUGGESTION_STATUS_LABELS: Record<string, string> = {
  PENDING: "확인 필요",
  CONFIRMED: "기억됨",
  DISMISSED: "넘김",
};

export const FORESHADOW_STATUS_LABELS: Record<string, string> = {
  PLANTED: "심음",
  REVEALED: "회수됨",
  ABANDONED: "보류/폐기",
};

export const ANALYSIS_JOB_STATUS_LABELS: Record<string, string> = {
  QUEUED: "대기",
  RUNNING: "진행 중",
  DONE: "완료",
  FAILED: "실패",
};
