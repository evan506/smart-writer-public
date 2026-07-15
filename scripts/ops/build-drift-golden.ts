/**
 * Build a DRIFT golden from a prior extraction-run result + its chapter texts.
 *
 * Drift/recall-only baseline (NOT a correctness golden — see drift-golden.ts).
 * No API needed: pure transform of local files. Output is gitignored.
 *
 * Usage:
 *   npx tsx scripts/ops/build-drift-golden.ts \
 *     --label=sample \
 *     --result=references/test-data/sample/sample-extraction-result.json \
 *     --chapters=references/test-data/sample
 */
import fs from "node:fs";
import path from "node:path";
import { buildDriftGoldenFromResult } from "../../src/lib/services/extraction-eval/drift-golden";

const OUT_DIR = path.resolve(__dirname, "../../eval-reports/golden");

function argValue(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

function loadChapters(dir: string): { num: number; content: string }[] {
  const chapters: { num: number; content: string }[] = [];
  for (const file of fs.readdirSync(dir)) {
    const match = file.match(/^ch(\d+)\.md$/);
    if (!match) continue;
    chapters.push({
      num: Number(match[1]),
      content: fs.readFileSync(path.join(dir, file), "utf8"),
    });
  }
  return chapters.sort((a, b) => a.num - b.num);
}

function main() {
  const label = argValue("label");
  const resultPath = argValue("result");
  const chaptersDir = argValue("chapters");
  if (!label || !resultPath || !chaptersDir) {
    console.error(
      "Usage: build-drift-golden.ts --label=<l> --result=<result.json> --chapters=<dir>"
    );
    process.exit(1);
  }

  const result = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  const chapters = loadChapters(chaptersDir);
  const scenarios = buildDriftGoldenFromResult({ label, result, chapters });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `drift-${label}.json`);
  fs.writeFileSync(outFile, JSON.stringify(scenarios, null, 2), "utf8");

  const labeled = scenarios.reduce((sum, s) => sum + s.shouldExtract.length, 0);
  console.log(`[drift-golden] ${scenarios.length} scenarios, ${labeled} expected names`);
  console.log(`[drift-golden] -> ${outFile}`);
  console.log(
    "[drift-golden] NOTE: recall/drift-only baseline (prior-run output, no dismiss labels)."
  );
}

main();
