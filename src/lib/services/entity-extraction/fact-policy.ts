import type { ExtractedFact } from "../prompt-templates";

export const FACT_TYPES = new Set([
  "ATTRIBUTE",
  "ROLE",
  "AFFILIATION",
  "ABILITY",
  "STATE",
  "LOCATION_INFO",
  "RULE",
  "DESCRIPTION_TEXT",
]);

const SUBJECTIVE_FACT_PATTERNS = [
  /성격/,
  /말투/,
  /욕설/,
  /쌍욕/,
  /비꼬/,
  /빈정/,
  /핀잔/,
  /실망한 표정/,
  /웃는 얼굴/,
  /말이 많/,
  /엄격한/,
];

const VAGUE_ROLE_PATTERNS = [
  /하는 인물/,
  /한 인물/,
  /인물$/,
  /참여자/,
  /관찰자/,
  /의사결정자/,
  /대화하는/,
  /언급된/,
  /등장하는/,
  /바라보는/,
  /이야기하는/,
  /핀잔을 듣/,
  /알리려는 인물/,
  /급 인물/,
  /주최자/,
];

const TRANSIENT_STATE_PATTERNS = [
  /두려워/,
  /불평/,
  /떨고 있/,
  /떨면서/,
  /울먹/,
  /화난/,
  /화내/,
  /지친/,
  /지침/,
  /피곤/,
  /실망/,
  /놀라/,
  /당황/,
  /웃고 있/,
  /바라보/,
  /의심받/,
  /의심되는/,
  /추정/,
  /연관된/,
  /대상/,
  /주목받/,
  /눈치/,
];

const SCENE_DERIVED_DESCRIPTION_PATTERNS = [
  /특징이 있는 종족/,
  /귀에 나뭇가지/,
  /역할 놀이/,
  /자신의 이름을 강조/,
  /강조함/,
];

export function shouldKeepFactCandidate(fact: Pick<ExtractedFact, "fact_type" | "value">) {
  const value = fact.value.trim();
  if (!value) return false;

  // DESCRIPTION_TEXT is useful for stable physical/world descriptions, but the
  // model often tries to turn one-off tone, expression, or profanity into canon.
  if (fact.fact_type === "DESCRIPTION_TEXT" || fact.fact_type === "ROLE") {
    const noisyPatterns =
      fact.fact_type === "DESCRIPTION_TEXT"
        ? [...SUBJECTIVE_FACT_PATTERNS, ...SCENE_DERIVED_DESCRIPTION_PATTERNS]
        : SUBJECTIVE_FACT_PATTERNS;
    if (noisyPatterns.some((pattern) => pattern.test(value))) {
      return false;
    }
  }

  if (
    fact.fact_type === "ROLE" &&
    VAGUE_ROLE_PATTERNS.some((pattern) => pattern.test(value))
  ) {
    return false;
  }

  if (
    fact.fact_type === "STATE" &&
    TRANSIENT_STATE_PATTERNS.some((pattern) => pattern.test(value))
  ) {
    return false;
  }

  return true;
}
