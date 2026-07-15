import type { ExtractedEntity } from "../prompt-templates";

export { normalizeEntityName } from "../text-normalize";
import { normalizeEntityName } from "../text-normalize";

export function normalizedNameSet(items: Iterable<string>): Set<string> {
  const set = new Set<string>();
  for (const item of items) {
    set.add(normalizeEntityName(item));
  }
  return set;
}

const STANDALONE_GENERIC_ROLE_TERMS = new Set([
  "사자",
  "전령",
  "경비병",
  "경비",
  "병사",
  "기사",
  "정찰병",
  "전사",
  "개척자",
  "개척자들",
  "하인",
  "시종",
  "사용인",
  "메이드",
  "상인",
  "점원",
  "주인",
  "왕",
  "왕족",
  "영주",
  "영주님",
  "주민",
  "마을사람",
  "마을사람들",
  "원주민",
  "원주민들",
  "노예",
  "노예들",
  "제국민",
  "제국민들",
  "야만인",
  "야만인들",
  "야만족",
  "아이",
  "노인",
  "남자",
  "여자",
  "꼬마",
  "꼬맹이",
  "녀석",
  "놈",
  "미친놈",
  "멍청이",
  "배신자",
  "괴물",
  "도어락",
  "카드",
  "케이지",
  "늑대귀",
  "여우귀",
  "토끼귀",
  "고양이귀",
]);

export function isStandaloneGenericRoleCandidate(name: string): boolean {
  return STANDALONE_GENERIC_ROLE_TERMS.has(normalizeEntityName(name));
}

const SPECIES_LIKE_SUFFIXES = [
  "수인",
  "마족",
  "엘프",
  "하피",
  "오크",
  "드래곤",
  "인간",
];

const GENERIC_SPECIES_CONTEXT_PATTERNS = [
  /종족/,
  /부족/,
  /출신/,
  /혈통/,
  /계통/,
  /무리/,
  /집단/,
  /사회/,
  /문화/,
  /사람들/,
  /주민/,
  /노예제도/,
  /들(?:은|이|을|과|도|처럼|에게|한테)/,
];

const INDIVIDUAL_CONTEXT_PATTERNS = [
  /이름은/,
  /내 이름은/,
  /라고 말했다/,
  /말하는/,
  /말했다/,
  /서있/,
  /고개를/,
  /꼬마/,
  /녀석/,
  /그녀석/,
  /함께/,
  /물려받/,
  /사색/,
  /속닥/,
  /웃/,
  /다가/,
  /꺼낸/,
  /상처/,
  /통과시켰다/,
  /자기소개/,
];

export function isSpeciesLikeName(name: string): boolean {
  const normalized = normalizeEntityName(name);
  return SPECIES_LIKE_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function shouldTreatAsGenericSpecies(
  name: string,
  contextSnippet: string
): boolean {
  if (!isSpeciesLikeName(name)) return false;

  const normalizedName = normalizeEntityName(name);
  const normalizedContext = normalizeEntityName(contextSnippet);
  if (!normalizedContext) return false;

  if (
    normalizedContext.includes(`${normalizedName}들`) ||
    normalizedContext.includes(`${normalizedName}종족`) ||
    normalizedContext.includes(`${normalizedName}부족`)
  ) {
    return true;
  }

  if (INDIVIDUAL_CONTEXT_PATTERNS.some((pattern) => pattern.test(contextSnippet))) {
    return false;
  }

  return GENERIC_SPECIES_CONTEXT_PATTERNS.some((pattern) =>
    pattern.test(contextSnippet)
  );
}

export function normalizeSpeciesLikeCharacterCandidates(
  entities: ExtractedEntity[]
): ExtractedEntity[] {
  return entities.map((entity) => {
    if (
      entity.type !== "CHARACTER" ||
      entity.sub_type === "alias_ref" ||
      !shouldTreatAsGenericSpecies(entity.name, entity.context_snippet)
    ) {
      return entity;
    }

    return {
      ...entity,
      type: "CONCEPT",
      sub_type: "species",
    };
  });
}

const GROUP_LIKE_CHARACTER_SUFFIXES = [
  "노예",
  "노예들",
  "종복",
  "종복들",
  "부하",
  "부하들",
];

const GROUP_LIKE_CONTEXT_PATTERNS = [
  /들(?:은|이|을|과|도|처럼|에게|한테|과함께)/,
  /들과/,
  /집단/,
  /무리/,
  /대상/,
  /계층/,
  /상태/,
];

export function shouldTreatAsGroupLikeConcept(
  name: string,
  contextSnippet: string
): boolean {
  const normalizedName = normalizeEntityName(name);
  if (
    !GROUP_LIKE_CHARACTER_SUFFIXES.some((suffix) =>
      normalizedName.endsWith(suffix)
    )
  ) {
    return false;
  }

  const normalizedContext = normalizeEntityName(contextSnippet);
  if (!normalizedContext) return false;
  if (normalizedContext.includes(`${normalizedName}들`)) return true;

  return GROUP_LIKE_CONTEXT_PATTERNS.some((pattern) =>
    pattern.test(contextSnippet)
  );
}

export function normalizeGroupLikeCharacterCandidates(
  entities: ExtractedEntity[]
): ExtractedEntity[] {
  return entities.map((entity) => {
    if (
      entity.type !== "CHARACTER" ||
      entity.sub_type === "alias_ref" ||
      !shouldTreatAsGroupLikeConcept(entity.name, entity.context_snippet)
    ) {
      return entity;
    }

    return {
      ...entity,
      type: "CONCEPT",
      sub_type: "role",
    };
  });
}

export function filterEntityCandidates(
  candidates: string[],
  confirmedNames: Set<string>,
  excludedTerms: Set<string>,
  genreExcluded: Set<string>
): string[] {
  return candidates.filter((name) => {
    const norm = normalizeEntityName(name);
    if (confirmedNames.has(norm)) return false;
    if (excludedTerms.has(norm)) return false;
    if (genreExcluded.has(norm)) return false;
    if (isStandaloneGenericRoleCandidate(name)) return false;
    if (name.length <= 1) return false;
    return true;
  });
}
