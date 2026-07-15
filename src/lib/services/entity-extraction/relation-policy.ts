import type { ExtractedRelation } from "../prompt-templates";
import {
  AUTO_REGISTER_RELATION_TYPES,
  RELATION_TYPES,
  isAllowedRelationPair,
  isKnownRelationType,
} from "@/lib/relation-schema";

export const VALID_RELATION_TYPES = new Set(RELATION_TYPES);

export const AUTO_REGISTER_MIN_WEIGHT = 0.75;

export function isValidRelationType(relationType: string): boolean {
  return isKnownRelationType(relationType);
}

export function isValidCrossTypeRelation(
  fromType: string,
  toType: string,
  relationType: string
): boolean {
  return isAllowedRelationPair(fromType, toType, relationType);
}

export function isAutoRegisterableRelation(
  relation: Pick<ExtractedRelation, "relation_type" | "weight">
): boolean {
  return (
    AUTO_REGISTER_RELATION_TYPES.has(relation.relation_type) &&
    relation.weight >= AUTO_REGISTER_MIN_WEIGHT
  );
}

const CHARACTER_RELATION_EVIDENCE_PATTERNS: Record<string, RegExp[]> = {
  ALLY: [
    /동맹/,
    /아군/,
    /협력/,
    /같은 편/,
    /한편/,
    /동료/,
    /함께.{0,20}(?:싸|전투|맞서|지키|구하|도우)/,
    /(?:도와주|도움|구해|구하|지켜|지키|보호)/,
  ],
  FRIEND: [
    /친구/,
    /벗/,
    /동료/,
    /우정/,
    /가까운 사이/,
    /친밀/,
    /함께\s*(?:자랐|지냈|웃|마셨|먹었)/,
  ],
  ENEMY: [
    /적(?:군|진영|대상|으로|과|을|에게|들|으로서)/,
    /적대/,
    /원수/,
    /숙적/,
    /대적/,
    /배신/,
    /복수/,
    /죽이/,
    /살해/,
    /공격/,
    /위협/,
    /겨누/,
    /싸우/,
    /맞붙/,
  ],
  RIVAL: [/라이벌/, /맞수/, /경쟁/, /겨루/, /결투/, /승부/, /대립/],
  FAMILY: [
    /가족/,
    /혈연/,
    /부모/,
    /아버지/,
    /어머니/,
    /아들/,
    /딸/,
    /형제/,
    /자매/,
    /남매/,
    /오빠/,
    /형(?:은|이|을|에게|과|님)/,
    /누나/,
    /언니/,
    /동생/,
  ],
  ROMANTIC: [
    /연인/,
    /사랑/,
    /연애/,
    /혼인/,
    /결혼/,
    /약혼/,
    /남편/,
    /아내/,
    /배우자/,
    /정인/,
  ],
  SERVES: [
    /섬기/,
    /모시/,
    /복종/,
    /명령(?:을|에|대로|했다|하|받|내리)/,
    /주인(?:을|에게|으로|님|의|과|이라)/,
    /상관/,
    /부하/,
    /하인/,
    /시종/,
    /메이드/,
    /고용/,
    /호위/,
  ],
  MENTOR_OF: [
    /스승/,
    /제자/,
    /사제/,
    /가르치/,
    /배우/,
    /수련/,
    /훈련/,
    /사사/,
    /지도하|지도받|지도했|지도했다/,
  ],
};

export function hasCharacterRelationEvidence(
  relationType: string,
  contextSnippet: string
): boolean {
  const patterns = CHARACTER_RELATION_EVIDENCE_PATTERNS[relationType];
  if (!patterns || !contextSnippet.trim()) return false;
  return patterns.some((pattern) => pattern.test(contextSnippet));
}

export function hasAnyCharacterRelationEvidence(contextSnippet: string): boolean {
  return Object.keys(CHARACTER_RELATION_EVIDENCE_PATTERNS).some((relationType) =>
    hasCharacterRelationEvidence(relationType, contextSnippet)
  );
}
