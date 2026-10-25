// Narrow lexical guard for gendered kinship invented from a one-way relation.
// This does not prove general semantic grounding; writer review remains required.
const GENDERED_KINSHIP_TERMS = [
  "오빠", "언니", "누나", "남동생", "여동생", "남매", "자매", "형제",
  "아버지", "어머니", "남편", "아내",
];
export function hasUnsupportedKinshipClaim(claim: string, evidence: string): boolean {
  const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/g, "");
  const source = normalize(evidence);
  const answer = normalize(claim);
  return GENDERED_KINSHIP_TERMS.some(term => answer.includes(term) && !source.includes(term));
}
