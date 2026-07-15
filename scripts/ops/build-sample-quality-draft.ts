/**
 * DRAFT quality golden for a sample manuscript (Thinkly P4.5 "LLM-drafted
 * scenario → human approval" pattern). Starts from the drift golden's
 * per-chapter names and:
 *  - moves clear NOISE to shouldNotExtract (enables precision measurement),
 *  - UNLABELS ambiguous/descriptive names (scorer ignores them),
 *  - keeps clear proper-noun entities as shouldExtract.
 *
 * The NOISE/BORDERLINE judgments are an LLM draft, NOT ground truth — the
 * author must review. Output is gitignored (eval-reports/golden/).
 *
 * Usage: npx tsx scripts/ops/build-sample-quality-draft.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildDriftGoldenFromResult } from "../../src/lib/services/extraction-eval/drift-golden";

const RESULT = "references/test-data/sample/sample-extraction-result.json";
const CHAPTERS_DIR = "references/test-data/sample";
const OUT = path.resolve(__dirname, "../../eval-reports/golden/quality-sample-draft.json");

// Clear noise: states/metaphors mislabeled as entities, exact duplicates/typos
// of a named entity, and anonymous generic roles. -> shouldNotExtract.
const NOISE = new Set([
  "미아", // "길을 잃은 상태" — a state, not an entity
  "집사", // "은유적으로 언급된 직책" — metaphor
  "과자주인", // "잡화점 주인과 동일한 인물" — duplicate
  "루아", // typo/duplicate of 로아
  "리엔 대장", // alias of 리엔 하르트
  "세라 부사령관", // alias of 세라 우드가드
  "사령관", // generic command role (CONCEPT)
  "지휘관", // generic command role (CONCEPT)
  "마족놈", // anonymous slur descriptor
  "영지 군인", // "익명의 군인" — anonymous generic
]);

// Ambiguous: descriptive unnamed figures, generic roles, plural collectives,
// or aspects of another entity. Honest call belongs to the author -> UNLABEL.
const BORDERLINE = new Set([
  "영주", "영지민", "왕국", "영지군", "오크왕", "엘프왕", "마족 소녀", "외뿔 여인",
  "시종", "엘프 노인", "마족 꼬마", "마족 꼬맹이", "수도", "마부", "감독관", "대마왕",
  "동쪽", "변방 마을", "노인 마왕", "큰 날개를 가진 노인", "외뿔을 가진 청년",
  "무표정한 소년", "뿔을 가진 소녀", "외뿔의 마왕", "엘프 장군", "옆마을", "할망구",
  "대마족", "늑대 권속", "근육질의 엘프", "검성", "깃털검", "인면조", "황금나무",
]);

function loadChapters() {
  return fs
    .readdirSync(CHAPTERS_DIR)
    .map((f) => f.match(/^ch(\d+)\.md$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({
      num: Number(m[1]),
      content: fs.readFileSync(path.join(CHAPTERS_DIR, m[0]), "utf8"),
    }))
    .sort((a, b) => a.num - b.num);
}

function main() {
  const result = JSON.parse(fs.readFileSync(RESULT, "utf8"));
  const drift = buildDriftGoldenFromResult({
    label: "sample",
    result,
    chapters: loadChapters(),
  });

  let pos = 0;
  let neg = 0;
  let unlabeled = 0;
  const quality = drift.map((s) => {
    const shouldExtract: string[] = [];
    const shouldNotExtract: string[] = [];
    for (const name of s.shouldExtract) {
      if (NOISE.has(name)) shouldNotExtract.push(name);
      else if (BORDERLINE.has(name)) unlabeled++;
      else shouldExtract.push(name);
    }
    pos += shouldExtract.length;
    neg += shouldNotExtract.length;
    return {
      ...s,
      id: s.id.replace("drift:", "quality-draft:"),
      source: s.source.replace("drift ", "quality-draft ").replace(" (prior-run output, recall-only)", " (LLM-drafted labels, needs author approval)"),
      shouldExtract,
      shouldNotExtract,
    };
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(quality, null, 2), "utf8");
  console.log(`[quality-draft] ${quality.length} scenarios -> ${OUT}`);
  console.log(`[quality-draft] positives=${pos} negatives=${neg} unlabeled(borderline)=${unlabeled}`);
  console.log(`[quality-draft] negatives:`, [...NOISE].join(", "));
}

main();
