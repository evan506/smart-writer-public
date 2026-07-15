// Hand-authored starter golden scenarios so the eval harness is runnable before
// real confirm/dismiss data is mined (Thinkly ships authored scenarios too).
// shouldExtract = named entities; shouldNotExtract = the unspecified
// individuals / crowds the product is meant to avoid surfacing.

import type { GoldenScenario } from "./types";

export const STARTER_GOLDEN_SCENARIOS: GoldenScenario[] = [
  {
    id: "starter:hunter-gate",
    source: "authored:hunter",
    chapterText: `세나는 흑요석 단검을 품에서 꺼냈다. 날에는 옛 문자가 희미하게 남아 있었다.
붉은 탑 지하 서고의 문은 안쪽에서만 열렸다. 그곳에서 세나는 길드 '여명회'의 인장을 발견했다.
주변에는 무명 경비병들이 서성였고, 지나가던 상인 하나가 흘끔 쳐다보았을 뿐이다.`,
    shouldExtract: ["세나", "흑요석 단검", "붉은 탑 지하 서고", "여명회"],
    shouldNotExtract: ["무명 경비병들", "지나가던 상인"],
  },
  {
    id: "starter:regression-memory",
    source: "authored:regression",
    chapterText: `세이람은 회귀 전의 기억을 떠올렸다. 흑철 성채의 화재, 그리고 리엔 하르트의 마지막 말.
성채 사람들은 아무것도 모른 채 웃고 있었다. 그는 다시 한 번 운명을 바꾸기로 했다.`,
    shouldExtract: ["세이람", "흑철 성채", "리엔 하르트"],
    shouldNotExtract: ["성채 사람들"],
  },
];
