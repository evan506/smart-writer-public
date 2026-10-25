import {
  ROLE_CLASSIFICATION_RULES,
  STRUCTURED_ANALYSIS_DATA_GUARD,
  dataSection,
} from "../prompt-templates/prompt-guards";

export const STAGE2_EVAL_PROFILE = "stage2-schema-evidence-v1";
export const STAGE2_COMPACT_EVAL_PROFILE = "stage2-compact-v3";
export type Stage2EvalProfile = typeof STAGE2_EVAL_PROFILE | typeof STAGE2_COMPACT_EVAL_PROFILE;

/** Opt-in evaluation contract; optional fields stay absent rather than null. */
export const STAGE2_EVAL_RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "stage2_schema_evidence_v1",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["entities"],
      properties: {
        entities: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "type", "importance", "summary", "confidence"],
            properties: {
              name: { type: "string" },
              type: { type: "string" },
              sub_type: { type: "string" },
              importance: { type: "string", enum: ["high", "low"] },
              alias_of: { type: "string" },
              summary: { type: "string" },
              confidence: { type: "number" },
              context_snippet: { type: "string" },
              facts: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["fact_type", "evidence", "value"],
                  properties: {
                    fact_type: { type: "string" },
                    fact_key: { type: "string" },
                    evidence: { type: "string" },
                    value: { type: "string" },
                    confidence: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export function buildStage2EvalPrompt(
  candidatesWithSnippets: string,
  confirmedEntities: string,
  guidanceBlock = ""
): { system: string; user: string } {
  const system = `당신은 한국 웹소설의 엔티티 분류 전문가입니다.

${STRUCTURED_ANALYSIS_DATA_GUARD}

지정된 schema의 entities 객체만 간결한 JSON으로 반환하세요. 코드펜스·설명·들여쓰기 없이, 선택 필드는 해당될 때만 쓰고 null로 채우지 마세요.
type은 CHARACTER / PLACE / ITEM / ORGANIZATION / CONCEPT / MAGIC_SYSTEM. sub_type은 CHARACTER의 named/unnamed/alias_ref, ORGANIZATION의 faction/group, CONCEPT의 species/skill/role입니다.
importance는 반복 등장·줄거리 영향이면 high, 일회성 언급이면 low. entity/fact confidence는 0~1입니다.

근거 우선:
속성값보다 먼저 원문의 evidence 구절을 선택하세요. 그 구절의 서술 대상이 후보와 명시적으로 연결되거나 인접 문맥에서 유일하게 풀릴 때만 value를 쓰세요. 근거의 화자·관찰자·질문자·암기자는 서술 대상과 다를 수 있습니다.
이름 포함 여부만으로 판단하지 마세요. 대명사·별칭도 연결이 유일하면 유효합니다. 실제 변신과 타인이 명확히 설명한 칭호도 보존하되, 칭호는 화자가 아닌 설명 대상에게 붙이세요.
예: 세호가 메이드 유나의 이름을 외웠다는 것은 세호의 직업 근거가 아닙니다. 민아가 적에게 "혼자 싸워?"라고 물었다고 민아의 능력이 되지 않습니다.
애매하면 그 속성만 생략하고, 근거 있는 인물과 중립 summary는 유지하세요. summary도 주체·행동 방향을 원문대로 쓰고 확정되지 않은 설정을 우회해서 넣지 마세요. 추측·전언·반론은 그 상태를 유지하거나 주장만 생략하세요.
역할놀이·농담·비유만으로 실제 독립 인물·종족·능력을 만들지 마세요. "남편처럼 반긴다"는 혼인이나 출장의 근거가 아닙니다. 실제 이름 있는 대화 자체는 제외하지 마세요.

종족 일반/집단/문화/혈통은 CONCEPT/species. 말하거나 행동하는 구체적 무명 개인("말하는 소머리 수인")은 CHARACTER/unnamed. 특정 개인이 아닌 상태·집단은 CONCEPT/role 또는 제외하세요.
${ROLE_CLASSIFICATION_RULES}
alias_ref는 명확한 별칭·칭호·자칭에만, alias_of는 해당 기존 인물명으로 쓰세요.
facts는 직접 근거가 있는 안정적인 종족·직업·소속·능력·거주지 등 단일 설정입니다. fact_type은 ATTRIBUTE / ROLE / AFFILIATION / ABILITY / STATE / LOCATION_INFO / RULE / DESCRIPTION_TEXT.
ROLE은 직업·직책·신분·칭호만. 순간 대화 상대·관찰·파티 주최 역할은 제외하세요. STATE는 누명·포박·실종·부상·봉인 같은 지속 상태만. 순간 감정·시선·추정·성격/말투/욕설 평가·일회성 행동은 설정 fact로 승격하지 마세요.
"갈등 관계", "관련 있음" 같은 막연한 설명 대신 직접 뒷받침되는 구체 설정만 쓰세요.

summary는 짧은 한 문장(목표60자 안팎), context_snippet은 개인·종족·집단·별칭 구분에 충분한 짧은 원문 구절입니다. context_snippet과 evidence는 실제 원문의 단일 연속 substring이며, 주체·추측·지칭 단서를 남기세요. 문장 합성·이름 변경·서버 임의 절단을 전제하지 마세요.
entity/fact confidence와 context_snippet을 유지하세요. facts는 선택사항이지만 직접 설정3개 이상도 보존하며 개수 상한은 없습니다. 중복·장황한 인용만 줄이고 새 필드·긴 확인 과정은 출력하지 마세요.

이미 등록된 엔티티 목록 (참고용):
${confirmedEntities}
${guidanceBlock.trim()}
schema에 맞는 entities 객체만 반환하세요.`;

  const user = `${dataSection("candidate_snippets", candidatesWithSnippets)}

각 후보를 분류하세요. "하린은 엘프 사서다. 그는 실제로 늑대로 변신했다."는 종족·직업·변신3개를 유지합니다. "그녀 아란은 북부의 검성이다"는 명확한 연결이 있으면 아란의 칭호입니다.
fact의 근거 우선 예시: {"fact_type":"ROLE","evidence":"하린은 엘프 사서다.","value":"사서","confidence":0.9}`;

  return { system, user };
}

export function buildStage2CompactEvalPrompt(
  candidatesWithSnippets: string,
  confirmedEntities: string,
  guidanceBlock = ""
): { system: string; user: string } {
  const system = `당신은 한국 웹소설의 엔티티 분류 전문가입니다.

${STRUCTURED_ANALYSIS_DATA_GUARD}

출력 계약:
- type: CHARACTER / PLACE / ITEM / ORGANIZATION / CONCEPT / MAGIC_SYSTEM.
- sub_type: CHARACTER는 named/unnamed/alias_ref, ORGANIZATION은 faction/group, CONCEPT는 species/skill/role.
- importance: high(반복 등장·줄거리 영향) / low(일회성 언급). confidence는 0~1 숫자.
- summary: 확인된 정체·행동을 짧은 한 문장(목표60자 안팎)으로. 길이를 맞추려고 가능성 표현을 빼거나 직업·능력·인과를 추정하지 마세요.
- context_snippet: 후보/개인·종족·집단/별칭을 구별할 수 있는 짧은 원문 구절. 주체와 추측 단서를 남기세요.
- facts는 선택사항. fact_type은 ATTRIBUTE / ROLE / AFFILIATION / ABILITY / STATE / LOCATION_INFO / RULE / DESCRIPTION_TEXT. value는 단일 설정 한 줄, evidence는 이를 뒷받침하는 원문의 단일 연속 구절, confidence는 0~1 숫자.

주장 선택:
summary, facts, type/sub_type 모두 주장 대상·실제 서술·확정 여부가 현재 후보와 맞을 때만 출력하세요. 화자·관찰자·질문자는 서술 대상과 다를 수 있습니다. 원문 문장이 있다는 것만으로 해당 후보의 설정이 되지 않습니다.
직업·종족·능력·소속을 동시 등장·장소 이동·호칭만으로 추정하지 마세요. 확정되지 않은 설정을 summary에 우회해서 넣지 마세요. 추측·전언·평가는 그 상태를 유지하거나 해당 주장만 생략하고, 근거 있는 인물 후보 자체는 유지할 수 있습니다.
대조:
- "혼자 군대를 상대해?"라고 민아가 적에게 물었다 → 질문자 민아의 전투 능력이 아니다.
- 세호가 "유나, 모리"를 외웠다. 두 이름은 메이드들이다 → 메이드는 유나·모리이며 세호의 직업 근거가 아니다.
- "도윤의 기적일 수도." "그럴 리 없어." → 도윤의 실제 능력으로 확정하지 않는다.
역할놀이·농담·비유 속 호칭만으로 실제 독립 인물·종족·능력을 만들지 마세요. "출장 간 남편처럼"은 실제 출장의 근거가 아닙니다. 반대로 실제 인물의 이름 있는 대화와 명확한 칭호 설명까지 제외하지 마세요.
양성: "서린은 엘프 사서다. 서린은 실제로 늑대로 변신했다."의 종족·직업·변신은 유지하세요. "녀석 아란은 북부의 검성이다"라는 설명은 화자가 아닌 아란의 칭호 근거입니다.

종족명(엘프, 마족, 오크 등)은 CONCEPT/species. 종족 일반/집단/문화/혈통과 달리, 말하거나 행동하는 구체적인 무명 개인("말하는 소머리 수인")은 CHARACTER/unnamed입니다.
특정 개인이 아닌 상태·집단("완성된 노예들", "부하들")은 CONCEPT/role 또는 제외하세요.
${ROLE_CLASSIFICATION_RULES}
alias_ref는 명확한 별칭·칭호·자칭에만, alias_of는 해당 기존 인물명으로. 일회성 놀림·수식은 별칭으로 분리하지 마세요.
안정적인 직업·직책·소속·종족·능력·거주지는 facts로 유지하세요. ROLE은 직업·직책·신분·칭호만; 대화 상대·파티 주최자·도움 요청 같은 순간 역할은 제외하세요.
STATE는 누명·포박·실종·부상·봉인 같은 지속 상태만. 순간 감정·표정·시선·의심·추정, 성격/말투/욕설 평가, 일회성 행동·비유는 설정 fact로 승격하지 마세요.
facts는 "갈등 관계", "관련 있음" 같은 막연한 관계가 아닌 구체 설정이어야 합니다. 반복 습격 같은 사건 설정도 evidence가 직접 뒷받침할 때만 허용합니다.
context_snippet과 evidence는 입력 원문의 실제 substring만. 떨어진 문장을 합성하거나 이름을 바꿔 인용하지 마세요. 불확실하면 주장만 생략하고, 인물 자체 근거도 없으면 항목을 생략하세요.

간결한 JSON 배열만 반환하세요. 코드펜스·설명·들여쓰기·불필요한 공백 없이 출력하세요. summary 반복·중복 fact·장황한 인용을 줄이되 주체·추측·지칭 단서는 보존하세요. 직접 명시된 설정3개 이상도 유지하며 facts 개수 상한은 없습니다.
entity와 fact의 confidence, entity의 context_snippet을 유지하세요. sub_type/alias_of 등 선택 필드는 해당될 때만 출력하고 null로 채우지 마세요. 내부 확인 과정이나 새 필드는 출력하지 마세요.

이미 등록된 엔티티 목록 (참고용):
${confirmedEntities}
${guidanceBlock.trim() ? `\n${guidanceBlock.trim()}\n` : ""}
JSON 배열만 반환.`;

  const user = `${dataSection("candidate_snippets", candidatesWithSnippets)}

각 후보를 분류하세요. 직접 설정3개가 있는 출력 예시:
[{"name":"서린","type":"CHARACTER","sub_type":"named","importance":"high","summary":"늑대로 변신하는 엘프 사서","confidence":0.9,"context_snippet":"서린은 엘프 사서다. 서린은 실제로 늑대로 변신했다.","facts":[{"fact_type":"ATTRIBUTE","value":"엘프","evidence":"서린은 엘프 사서다.","confidence":0.9},{"fact_type":"ROLE","value":"사서","evidence":"서린은 엘프 사서다.","confidence":0.9},{"fact_type":"ABILITY","value":"늑대로 변신","evidence":"서린은 실제로 늑대로 변신했다.","confidence":0.9}]}]`;

  return { system, user };
}
