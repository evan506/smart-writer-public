import { describe, expect, it } from "vitest";
import { buildClassificationBatchContext } from "@/lib/services/entity-extraction/classification-context";
import { extractClassificationContextSnippets, extractContextSnippets } from "@/lib/services/entity-extraction/snippet-policy";

type SharedContext = { windows: { id: number; text: string }[]; candidates: { name: string; window_ids: number[] }[] };
function sharedData(payload: string): SharedContext {
  return JSON.parse(payload.slice(payload.indexOf("\n") + 1));
}
const names = ["가람", "나린", "다온", "라온"];
const source = `${names.join("과 ")}은 같은 서고의 사서다. ${"모두 책을 정리했다. ".repeat(12)}`;

describe("classification input sharing", () => {
  it("shares identical source windows while retaining each candidate's exact references", () => {
    const result = buildClassificationBatchContext(names, source);
    expect(result.mode).toBe("shared");
    const data = sharedData(result.payload);
    expect(data.candidates.map((row) => row.name)).toEqual(names);
    expect(data.windows.length).toBeLessThan(names.length);
    for (const row of data.candidates) {
      expect(row.window_ids.map((id) => data.windows.find((window) => window.id === id)?.text))
        .toEqual(extractClassificationContextSnippets(source, row.name));
      expect(result.snippetMap.get(row.name)).toBe(extractContextSnippets(source, row.name, 1)[0]);
    }
    const inlineLength = names.map(name => `- **${name}**\n${extractClassificationContextSnippets(source, name).map(s => `  "${s.replace(/"/g, "'")}"`).join("\n")}`).join("\n\n").length;
    expect(result.payload.length).toBeLessThan(inlineLength);
  });

  it("preserves the existing inline representation when reference overhead is larger", () => {
    expect(buildClassificationBatchContext(["가람"], "가람은 사서다.")).toMatchObject({
      mode: "inline", payload: '- **가람**\n  "가람은 사서다."',
    });
    expect(buildClassificationBatchContext(["없는인물"], source)).toMatchObject({
      mode: "inline", payload: "- **없는인물**\n  (스니펫 없음)",
    });
    expect(buildClassificationBatchContext([], source).payload).toBe("");
  });

  it("keeps distinct overlapping windows instead of merging or dropping an occurrence", () => {
    const text = `${names.join("과 ")}이 모였다. ${"짧은 기록 ".repeat(24)}끝났다. ${names.join("과 ")}이 다시 모였다. ${"후속 기록 ".repeat(60)}`;
    const result = buildClassificationBatchContext(names, text);
    expect(result.mode).toBe("shared");
    const data = sharedData(result.payload);
    const expected = extractClassificationContextSnippets(text, names[0]);
    expect(expected).toHaveLength(2);
    expect(expected[0]).not.toBe(expected[1]);
    expect(data.windows.map(w => w.text)).toEqual(expected);
    expect(data.candidates[0].window_ids).toEqual([1, 2]);
  });

  it("preserves uncertainty, quotation, scene boundaries and distinct scene order", () => {
    const first = `${names.join("과 ")}이 '아마 그럴지도'라고 말했다. ${"그것은 추측이었다. ".repeat(12)}`;
    const second = `${names.join("과 ")}은 “아니다”라고 답했다. ${"다른 장면이었다. ".repeat(12)}`;
    const text = `${first}\n*****\n${second}`;
    const result = buildClassificationBatchContext(names, text);
    expect(result.mode).toBe("shared");
    const data = sharedData(result.payload);
    expect(data.windows).toHaveLength(2);
    expect(data.windows[0].text).toContain("'아마 그럴지도'");
    expect(data.windows[1].text).toContain("“아니다”");
    expect(data.windows.every(w => !w.text.includes("*****"))).toBe(true);
    expect(data.candidates.every(row => row.window_ids.join(",") === "1,2")).toBe(true);
  });

  it("scopes references to each batch and leaves missing-source candidates ungrounded", () => {
    const first = buildClassificationBatchContext(names, source);
    const secondNames = ["마루", "바다", "소라", "아라"];
    const text = `${secondNames.join("과 ")}은 마법사다. ${"종족과 직업은 다른 개념이다. ".repeat(12)}`;
    const second = buildClassificationBatchContext([...secondNames, "없는인물"], text);
    const a = sharedData(first.payload); const b = sharedData(second.payload);
    expect(a.windows[0].id).toBe(1); expect(b.windows[0].id).toBe(1);
    expect(b.candidates.map(c => c.name)).toEqual([...secondNames, "없는인물"]);
    expect(b.candidates.at(-1)?.window_ids).toEqual([]);
    expect(second.snippetMap.has("없는인물")).toBe(false);
    expect(b.windows.every(w => !a.windows.some(old => old.text === w.text))).toBe(true);
  });
});
