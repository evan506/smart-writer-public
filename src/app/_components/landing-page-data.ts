import { PAPER_THEME_TOKENS } from "@/lib/design-tokens";

export const LANDING_THEME = {
  bg: {
    base: PAPER_THEME_TOKENS.bgPage,
    surface: PAPER_THEME_TOKENS.bgElevated,
    // No PAPER_THEME_TOKENS equivalent (semi-transparent variant) — intentional
    // landing-only value, kept as a literal.
    elevated: "rgba(255,250,241,0.82)",
  },
  text: {
    primary: PAPER_THEME_TOKENS.textPrimary,
    secondary: PAPER_THEME_TOKENS.textSecondary,
    // No PAPER_THEME_TOKENS equivalent (textMuted is "#6b6358") — intentional
    // landing-only value, kept as a literal.
    muted: "#8c8172",
  },
  accent: PAPER_THEME_TOKENS.accent,
  accentSoft: PAPER_THEME_TOKENS.accentBg,
  entity: {
    CHARACTER: PAPER_THEME_TOKENS.accent,
    PLACE: PAPER_THEME_TOKENS.info,
    ITEM: PAPER_THEME_TOKENS.warning,
    // No PAPER_THEME_TOKENS equivalent — intentional landing-only value.
    ORGANIZATION: "#8b6f9f",
    RELATION: PAPER_THEME_TOKENS.danger,
  },
} as const;

export const ENTITIES = [
  { name: "리엔", type: "CHARACTER", desc: "주인공 · 흑철기사단 · 등장 23화" },
  { name: "카이론", type: "CHARACTER", desc: "엘프 용병단 부단장 · 등장 12화" },
  { name: "흑철 광산", type: "PLACE", desc: "장소 · 3개 관계 · 등장 5화" },
  { name: "영지민", type: "CHARACTER", desc: "마족 · 등장 8화" },
  { name: "엘프들의 나라", type: "PLACE", desc: "장소 · 2개 관계 · 등장 4화" },
  { name: "파멸의 검", type: "ITEM", desc: "아이템 · 1개 관계 · 등장 3화" },
  { name: "흑철기사단", type: "ORGANIZATION", desc: "조직 · 5명 소속 · 등장 15화" },
  { name: "세라", type: "CHARACTER", desc: "적대 관계 · 등장 9화" },
] as const;

export const RELATION_LINES = [
  { from: "리엔", to: "카이론", label: "동맹", color: LANDING_THEME.entity.RELATION },
  { from: "리엔", to: "세라", label: "적대", color: "#a35a45" },
  { from: "리엔", to: "흑철기사단", label: "소속", color: LANDING_THEME.entity.ORGANIZATION },
  { from: "파멸의 검", to: "리엔", label: "소유", color: LANDING_THEME.entity.ITEM },
] as const;

export const NOVEL_TEXT = `리엔은 검을 들어올렸다. 흑철 광산의 깊은 어둠 속에서, 파멸의 검이 희미한 빛을 내뿜고 있었다.

"여기서 물러서지 않겠다."

카이론이 그의 옆에 섰다. 엘프 특유의 고요한 눈빛이었지만, 그 안에 결의가 서려 있었다.

멀리서 세라의 웃음소리가 울려 퍼졌다.`;

export const TEXT_ENTITIES = [
  { name: "리엔", color: LANDING_THEME.entity.CHARACTER },
  { name: "흑철 광산", color: LANDING_THEME.entity.PLACE },
  { name: "파멸의 검", color: LANDING_THEME.entity.ITEM },
  { name: "카이론", color: LANDING_THEME.entity.CHARACTER },
  { name: "세라", color: LANDING_THEME.entity.CHARACTER },
] as const;

export const STEPS = [
  {
    number: "01",
    title: "그냥 글을 쓰세요",
    desc: "평소처럼 웹소설을 쓰고 챕터를 저장하세요. 특별한 형식이나 태그가 필요 없습니다.",
    delay: 400,
  },
  {
    number: "02",
    title: "원문 근거가 있는 후보를 찾습니다",
    desc: "저장하는 순간, 본문에서 인물, 장소, 아이템, 관계 후보를 찾아냅니다. 각 후보는 검토할 원문 문장과 함께 보여줍니다.",
    delay: 600,
  },
  {
    number: "03",
    title: "작가가 승인한 정보만 기억합니다",
    desc: "작품 기억에는 승인된 canon만 저장합니다. 후보는 원고 근거를 확인한 뒤 승인, 병합, 거절할 수 있습니다.",
    delay: 800,
  },
] as const;

export const PAIN_POINTS = [
  '"이 캐릭터 눈 색깔이 뭐였지?" — 15화 전에 썼던 걸 찾으러 스크롤...',
  '"이 두 캐릭터가 처음 만난 게 몇 화였더라?" — Ctrl+F 반복...',
  '"엑셀 설정집을 업데이트 안 해서 설정이 흔들렸다" — 독자 지적...',
  '"설정 정리하다가 글 쓸 시간이 사라졌다" — 본말전도...',
] as const;

export const FEATURES = [
  {
    icon: "🔍",
    title: "후보 찾기",
    desc: "챕터 저장 시 본문에서 인물, 장소, 아이템, 관계 후보를 찾아냅니다.",
    color: LANDING_THEME.entity.CHARACTER,
  },
  {
    icon: "📖",
    title: "작품 기억",
    desc: "작가가 승인한 설정을 한 곳에서 관리합니다. 검색, 필터, 분류별 정리를 지원합니다.",
    color: LANDING_THEME.entity.PLACE,
  },
  {
    icon: "🔗",
    title: "관계 미리보기",
    desc: "승인된 관계를 미리보기로 확인합니다. 후보 관계는 공식 설정처럼 섞지 않습니다.",
    color: LANDING_THEME.entity.RELATION,
  },
  {
    icon: "✏️",
    title: "밑줄 표시",
    desc: "에디터에서 작품 기억 항목이 밑줄로 표시됩니다. 분류별 색상으로 구분.",
    color: LANDING_THEME.entity.ITEM,
  },
  {
    icon: "✅",
    title: "기억할 설정 확인",
    desc: "원문에서 찾은 후보를 작가가 확인하고 선택합니다. 작품 기억 품질을 직접 관리합니다.",
    color: LANDING_THEME.entity.ORGANIZATION,
  },
  {
    icon: "💾",
    title: "자동 저장",
    desc: "글을 쓰는 동안 자동으로 저장됩니다. 집필 흐름이 끊기지 않습니다.",
    color: LANDING_THEME.accent,
  },
] as const;
