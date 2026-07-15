import { describe, expect, it } from "vitest";
import { buildDriftGoldenFromResult } from "@/lib/services/extraction-eval/drift-golden";

const result = {
  entities: [
    { name: "리엔 하르트", status: "auto_confirmed", first_chapter: 1 },
    { name: "변방 마을", status: "auto_confirmed", first_chapter: 1 },
    { name: "오크왕", status: "suggestion", first_chapter: 2 },
    { name: "이름없음", status: "auto_confirmed" }, // no first_chapter -> skipped
  ],
};

const chapters = [
  { num: 1, content: "1화 본문" },
  { num: 2, content: "2화 본문" },
  { num: 3, content: "3화 본문" }, // no attributed entities -> skipped
];

describe("buildDriftGoldenFromResult", () => {
  it("builds one recall-only scenario per chapter with attributed entities", () => {
    const scenarios = buildDriftGoldenFromResult({ label: "blackiron", result, chapters });
    expect(scenarios.map((s) => s.id)).toEqual([
      "drift:blackiron:ch1",
      "drift:blackiron:ch2",
    ]);
    expect(scenarios[0].shouldExtract).toEqual(["리엔 하르트", "변방 마을"]);
    expect(scenarios[0].shouldNotExtract).toEqual([]); // no dismiss labels
  });

  it("can restrict to auto_confirmed entities only", () => {
    const scenarios = buildDriftGoldenFromResult({
      label: "blackiron",
      result,
      chapters,
      autoConfirmedOnly: true,
    });
    // ch2's only entity is a suggestion -> excluded -> ch2 dropped.
    expect(scenarios.map((s) => s.id)).toEqual(["drift:blackiron:ch1"]);
  });

  it("skips chapters without text", () => {
    const scenarios = buildDriftGoldenFromResult({
      label: "x",
      result,
      chapters: [{ num: 1, content: "  " }],
    });
    expect(scenarios).toEqual([]);
  });
});
