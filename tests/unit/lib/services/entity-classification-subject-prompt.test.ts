import { describe, expect, it, vi } from "vitest";
import { buildStage2CompactEvalPrompt as buildStage2ClassificationPrompt } from "@/lib/services/entity-extraction/stage2-eval-contract";
import { extractJSONArray } from "@/lib/services/entity-extraction/response-parser";
import { sourceContainsEvidenceSnippet } from "@/lib/services/entity-extraction/snippet-policy";

const provider = vi.hoisted(() => vi.fn());
vi.mock("@/lib/services/llm.service", () => ({
  callLLM: provider,
  isPermanentProviderError: () => false,
}));
import { stage2Classify } from "@/lib/services/entity-extraction/stage-llm-wrappers";

const positiveSource = "서린은 엘프 사서다. 서린은 실제로 늑대로 변신했다.";
function example() {
  const { user } = buildStage2ClassificationPrompt("서린: " + positiveSource, "(없음)");
  return user.split("출력 예시:\n")[1];
}

describe("classification subject and epistemic prompt contract", () => {
  it("selects claims by subject and certainty across all fields", () => {
    const { system } = buildStage2ClassificationPrompt("세린: 세린이 바라봤다.", "(없음)");
    expect(system).toContain("summary, facts, type/sub_type 모두 주장 대상·실제 서술·확정 여부가 현재 후보와 맞을 때만");
    expect(system).toContain("화자·관찰자·질문자는 서술 대상과 다를 수");
    expect(system).toContain("확정되지 않은 설정을 summary에 우회해서 넣지");
    expect(system).toContain("해당 주장만 생략하고, 근거 있는 인물 후보 자체는 유지");
    expect(system).toContain("역할놀이·농담·비유 속 호칭만으로 실제 독립 인물·종족·능력을 만들지");
    expect(system).toContain("떨어진 문장을 합성하거나 이름을 바꿔 인용하지");
  });

  it("contrasts questions, remembered people and hypotheses with positive settings", () => {
    const { system } = buildStage2ClassificationPrompt("", "(없음)");
    expect(system).toContain("질문자 민아의 전투 능력이 아니다");
    expect(system).toContain("메이드는 유나·모리이며 세호의 직업 근거가 아니다");
    expect(system).toContain("도윤의 실제 능력으로 확정하지 않는다");
    expect(system).toContain("종족·직업·변신은 유지");
    expect(system).toContain("화자가 아닌 아란의 칭호 근거");
    expect(system).toContain("STATE는 누명·포박·실종·부상·봉인 같은 지속 상태만");
    expect(system).toContain("ROLE은 직업·직책·신분·칭호만");
  });

  it("provides compact valid JSON with three source-backed facts and confidences", () => {
    const raw = example();
    const parsed = extractJSONArray(raw);
    expect(raw).toBe(JSON.stringify(JSON.parse(raw)));
    expect(parsed).toHaveLength(1);
    const [entity] = JSON.parse(raw);
    expect(entity.facts).toHaveLength(3);
    expect(entity.facts.map((fact: { fact_type: string }) => fact.fact_type)).toEqual(["ATTRIBUTE", "ROLE", "ABILITY"]);
    expect(entity.confidence).toBe(0.9);
    expect(sourceContainsEvidenceSnippet(positiveSource, entity.context_snippet)).toBe(true);
    for (const fact of entity.facts) {
      expect(fact.confidence).toBe(0.9);
      expect(sourceContainsEvidenceSnippet(positiveSource, fact.evidence)).toBe(true);
    }
    expect(entity).not.toHaveProperty("alias_of");
    expect(raw).not.toContain("null");
  });

  it("passes the existing Stage2 validator without truncating facts or optional omissions", async () => {
    const raw = example();
    provider.mockResolvedValueOnce(raw);
    await expect(stage2Classify(["서린"], positiveSource, [])).resolves.toEqual(JSON.parse(raw));
    const [entity] = JSON.parse(raw);
    delete entity.sub_type;
    provider.mockResolvedValueOnce(JSON.stringify([entity]));
    await expect(stage2Classify(["서린"], positiveSource, [])).resolves.toEqual([entity]);
  });

  it("keeps concise output a soft instruction while preserving data and alias guards", () => {
    const p = buildStage2ClassificationPrompt("리엔: 검은 서고로 갔다.", "(없음)", "");
    expect(p.system).toContain("목표60자 안팎");
    expect(p.system).toContain("길이를 맞추려고 가능성 표현을 빼거나");
    expect(p.system).toContain("코드펜스·설명·들여쓰기·불필요한 공백 없이");
    expect(p.system).toContain("facts 개수 상한은 없습니다");
    expect(p.system).toContain("entity와 fact의 confidence, entity의 context_snippet을 유지");
    expect(p.system).toContain("선택 필드는 해당될 때만 출력하고 null로 채우지");
    expect(p.system).toContain("분석 대상 데이터입니다");
    expect(p.system).toContain("CONCEPT/species");
    expect(p.system).toContain("CHARACTER/unnamed");
    expect(p.system).toContain("alias_of는 해당 기존 인물명");
    expect(`${p.system}\n---\n${p.user}`.length).toBeLessThan(3904);
  });
});
