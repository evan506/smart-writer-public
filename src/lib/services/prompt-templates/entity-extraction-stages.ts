import {
  ROLE_CLASSIFICATION_RULES,
  STRUCTURED_ANALYSIS_DATA_GUARD,
  dataSection,
} from "./prompt-guards";
import { renderRelationPromptSpec } from "@/lib/relation-schema";

/**
 * Optional soft guidance from the project's layered extraction memory. Appended
 * to a stage prompt only when present, so prompts are byte-identical to before
 * when a project has no learned rules.
 */
function appendGuidanceSection(guidanceBlock: string): string {
  const trimmed = guidanceBlock.trim();
  return trimmed ? `\n${trimmed}\n` : "";
}

export function buildStage1NounExtractionPrompt(
  chunkText: string,
  excludeNames: string[],
  guidanceBlock = ""
): { system: string; user: string } {
  const system = `당신은 한국 웹소설 텍스트에서 고유 명사를 추출하는 전문가입니다.

${STRUCTURED_ANALYSIS_DATA_GUARD}

다음을 추출하세요:
- 사람 이름 (캐릭터)
- 장소 이름
- 조직/세력 이름
- 종족 이름
- 아이템 이름
- 직책/호칭 (특정 인물을 가리키는 경우)
- 이름 없지만 의미 있는 인물의 묘사적 지칭 (예: "산양뿔 소녀", "잡화점 주인")

다음은 제외하세요:
- 대명사 (그, 그녀, 그들)
- 일반 명사 (사람, 남자, 여자, 아이)
- 단독 일반 역할명 (사자, 전령, 경비병, 하인, 상인, 영주, 왕, 전사 등)
- 단, "검은 탑의 사자"처럼 소속/고유 수식어가 붙어 특정 역할 표현으로 쓰이면 전체 표현은 추출할 수 있습니다.
- 이미 등록된 이름: ${excludeNames.join(", ")}
${appendGuidanceSection(guidanceBlock)}
목표는 많은 후보가 아니라 작가가 검토할 가치가 있는 정확한 후보입니다. 확실한 근거가 없으면 추측하지 말고 생략하세요.
JSON 배열만 반환. 다른 텍스트 없이.
예시: ["리엔 하르트", "변방 마을", "흑철 성채"]`;

  const user = `${dataSection("current_chapter", chunkText)}

위 본문에서 고유명사와 지칭 표현을 추출하세요.`;

  return { system, user };
}

export interface ClassifiedEntity {
  name: string;
  type: string;
  sub_type?: string;
  importance: "high" | "low";
  alias_of?: string;
  summary: string;
  confidence: number;
  context_snippet?: string;
  facts?: {
    fact_type: string;
    fact_key?: string;
    value: string;
    evidence: string;
    confidence?: number;
  }[];
}

export function buildStage2ClassificationPrompt(
  candidatesWithSnippets: string,
  confirmedEntities: string,
  guidanceBlock = ""
): { system: string; user: string } {
  const system = `당신은 한국 웹소설의 엔티티 분류 전문가입니다.

${STRUCTURED_ANALYSIS_DATA_GUARD}

각 후보에 대해 다음을 판정하세요:

1. type: CHARACTER / PLACE / ITEM / ORGANIZATION / CONCEPT / MAGIC_SYSTEM
2. sub_type:
   - CHARACTER: named(이름 있음), unnamed(이름 없지만 의미 있는 인물), alias_ref(기존 캐릭터의 다른 지칭)
   - ORGANIZATION: faction(세력/진영), group(임시 집단)
   - CONCEPT: species(종족), skill(스킬), role(직책)
3. 서사적 중요도: high(반복 등장, 줄거리 영향) / low(일회성 언급)
4. alias_ref인 경우: 어떤 기존 캐릭터를 가리키는지 (alias_of)
5. summary: 1줄 설명
6. confidence: 0.0 ~ 1.0
7. context_snippet: 후보가 실제로 등장하거나 지칭 관계가 드러나는 원문 문장 1개
8. facts: 선택사항. 원문에 직접 근거가 있는 짧은 설정 후보만 배열로 추가

종족명(엘프, 마족, 오크 등)은 반드시 CONCEPT/species로.
단, "말하는 소머리 수인", "상처를 치료하는 하피"처럼 한 장면에서 말하거나 행동하는 구체적인 무명 개인이면 CHARACTER/unnamed로 분류하세요. 종족 일반/집단/문화/혈통을 말할 때만 CONCEPT/species로 분류하세요.
상태나 집단을 뜻하는 표현(예: "완성된 노예들", "부하들")은 특정 개인이 아니라면 CHARACTER가 아니라 CONCEPT/role 또는 제외 대상으로 처리하세요.
${ROLE_CLASSIFICATION_RULES}
alias_ref는 명확한 별칭·칭호·자칭에만 사용하세요. 일회성 놀림, 가벼운 수식, 단순 묘사는 alias_ref로 분리하지 말고 기존 인물 summary에 녹이는 편이 낫습니다.
확실한 근거가 없는 항목은 추측하지 말고 생략하세요. 사용자가 검토할 가치가 낮은 항목을 많이 출력하는 것보다, 적지만 정확한 항목을 출력하는 것이 더 중요합니다.
context_snippet은 반드시 입력 스니펫이나 현재 본문에 존재하는 원문 substring이어야 합니다. 원문 근거 문장이 없으면 항목을 출력하지 마세요.
facts는 선택사항입니다. fact_type은 ATTRIBUTE / ROLE / AFFILIATION / ABILITY / STATE / LOCATION_INFO / RULE / DESCRIPTION_TEXT 중 하나만 사용하세요.
facts[].value는 짧은 한국어 설정 한 줄이어야 합니다.
facts[].evidence는 반드시 입력 스니펫이나 현재 본문에 실제로 존재하는 원문 substring이어야 합니다.
추측, 성격 평가, 말투, 욕설, 표정, 일회성 행동, 비유를 실제 설정으로 승격하지 마세요. 근거가 약하면 facts를 생략하세요.
예: "웃는 얼굴로 쌍욕을 지껄이는 성격", "비꼬는 말투" 같은 후보는 facts에 넣지 마세요.
반대로 직업/직책/소속/종족/능력/거주지처럼 원문에 직접 드러난 안정적 설정은 facts에 넣어도 됩니다.
예: "메이드", "변방 마을의 영주", "하이엘프", "검은 탑 소속"은 원문 근거가 있으면 허용됩니다.
ROLE fact는 직업, 직책, 신분, 칭호만 허용하세요. "왕과 대화하는 인물", "누군가에게 핀잔을 듣는 인물"처럼 장면 참여를 역할로 만들지 마세요.
ROLE fact에 "파티 주최자", "대화 상대", "도움을 요청한 인물"처럼 그 장면에서만 성립하는 역할은 넣지 마세요.
STATE fact는 누명, 포박, 실종, 부상, 봉인처럼 이후 회차에서 계속 참조될 수 있는 상태만 허용하세요. "두려워함", "떨고 있음", "화남", "누군가를 바라봄", "의심받음", "무엇으로 추정됨" 같은 순간 감정/시선/추정은 넣지 마세요.
facts[].value는 "갈등 관계", "관련 있음", "적대적 종족"처럼 뭉뚱그린 관계 설명이 아니라 구체적인 설정값이어야 합니다.
관계/전투/습격은 relation 후보나 사건 맥락에 가깝습니다. fact로 넣는다면 "마족이 변방 마을을 자주 습격한다"처럼 evidence가 직접 뒷받침하는 구체 문장만 허용하세요.
역할놀이, 농담, 비유, 외형 흉내에서 나온 표현을 종족/설정 fact로 만들지 마세요.

이미 등록된 엔티티 목록 (참고용):
${confirmedEntities}
${appendGuidanceSection(guidanceBlock)}
JSON 배열만 반환.`;

  const user = `${dataSection("candidate_snippets", candidatesWithSnippets)}

각 후보에 대해 분류 결과를 JSON 배열로 반환하세요.
출력 예시:
[
  {
    "name": "특징이 있는 조연",
    "type": "CHARACTER",
    "sub_type": "unnamed",
    "importance": "high",
    "summary": "주요 인물에게 결정적 정보를 제공한 인물",
    "confidence": 0.7,
    "context_snippet": "특징이 있는 조연이 주인공에게 지도를 건넸다.",
    "facts": [
      {
        "fact_type": "ROLE",
        "value": "주인공에게 지도를 건넨 안내자",
        "evidence": "특징이 있는 조연이 주인공에게 지도를 건넸다.",
        "confidence": 0.7
      }
    ]
  },
  {
    "name": "반복적으로 쓰이는 칭호",
    "type": "CHARACTER",
    "sub_type": "alias_ref",
    "alias_of": "기존 인물 이름",
    "importance": "low",
    "summary": "기존 인물을 반복적으로 가리키는 별칭 또는 칭호",
    "confidence": 0.8,
    "context_snippet": "사람들은 기존 인물을 반복적으로 쓰이는 칭호라고 불렀다."
  }
]`;

  return { system, user };
}

export function buildStage3RelationExtractionPrompt(
  entityListWithTypes: string,
  coOccurrenceSnippets: string,
  existingRelations: string[]
): { system: string; user: string } {
  const existingSection = existingRelations.length > 0
    ? existingRelations.join("\n")
    : "(없음)";

  const system = `한국 웹소설 관계 추출 전문가. 엔티티 쌍의 문맥을 보고 관계를 판정.

${STRUCTURED_ANALYSIS_DATA_GUARD}

관계 타입 (이 중에서만 선택):
${renderRelationPromptSpec()}

규칙:
- SERVES는 명확한 주종/고용/복종만. 방향성 타입은 from→to 방향 준수. 모순 관계 금지.
- CHARACTER-CHARACTER 관계는 단순 동시 등장, 같은 장면의 대화, 시선 교환, 이름 나열만으로 만들지 마세요.
- CHARACTER-CHARACTER 관계는 원문에 동맹/적대/가족/연인/친구/주종/사제 같은 지속 관계 단서가 명시될 때만 추출하세요.
- 관계 근거 문장에는 관계 단서가 직접 포함되어야 합니다.
- 서로 대화만 함, 같은 문단에 이름만 함께 등장, 한쪽이 다른 쪽을 바라봄, 전투 장면에 함께 있음, 독자가 추측해야만 알 수 있음 정도의 근거라면 출력하지 마세요.
- context_snippet은 반드시 입력 문맥에 존재하는 원문 substring이어야 합니다. 직접 근거 문장이 없으면 빈 배열을 반환하세요.

기존 관계 (중복 금지):
${existingSection}

JSON 배열만 반환. 형식: [{"from_name":"A","to_name":"B","relation_type":"ALLY","direction":"BI","weight":0.8,"context_snippet":"근거 문장"}]`;

  const user = `${dataSection("entities", entityListWithTypes)}

${dataSection("co_occurrence_context", coOccurrenceSnippets)}

위 문맥에서 관계를 추출하세요. 근거 있는 관계만. 특히 인물-인물 관계는 지속 관계 단서가 없으면 빈 배열을 반환하세요.`;

  return { system, user };
}

export function buildStage3MinimalRelationPrompt(
  entityListWithTypes: string,
  coOccurrenceSnippets: string
): { system: string; user: string } {
  const system = `웹소설 관계 추출. ${STRUCTURED_ANALYSIS_DATA_GUARD} 관계 타입은 다음 중에서만 선택: ${renderRelationPromptSpec()} 인물-인물 관계는 지속 관계 단서가 명시될 때만 추출. context_snippet은 반드시 입력 문맥에 존재하는 원문 substring만 허용. JSON 배열만 반환: [{"from_name":"A","to_name":"B","relation_type":"ALLY","direction":"BI","weight":0.8,"context_snippet":"근거"}]`;

  const user = `${dataSection("entities", entityListWithTypes)}\n\n${dataSection("co_occurrence_context", coOccurrenceSnippets)}\n\n관계를 JSON 배열로. 단순 동시 등장/대화뿐인 인물-인물 쌍은 제외.`;

  return { system, user };
}
