import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/react";
import { textToDoc } from "@/lib/utils/editor-content";

/**
 * Tiptap `getText()`와 동일한 직렬화. `getTextBetween`은 첫 블록을 제외한 모든
 * 블록 앞에 blockSeparator(기본 "\n\n")를 붙이며, 비어 있는 paragraph도 예외가 아니다.
 */
function docToTextLike(doc: JSONContent): string {
  return (doc.content ?? [])
    .map((node) => node.content?.[0]?.text ?? "")
    .join("\n\n");
}

describe("editor content utilities", () => {
  it("splits plain text into paragraphs on the blank-line separator", () => {
    expect(textToDoc("첫 문장\n\n둘째 문장")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "첫 문장" }] },
        { type: "paragraph", content: [{ type: "text", text: "둘째 문장" }] },
      ],
    });
  });

  it("keeps a deliberate blank line as an empty paragraph", () => {
    expect(textToDoc("첫 문장\n\n\n\n둘째 문장")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "첫 문장" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "둘째 문장" }] },
      ],
    });
  });

  // Regression: textToDoc split on "\n" while getText() joins on "\n\n", so every
  // save→load cycle injected an extra empty paragraph and the blank lines doubled
  // (1 → 2 → 4 → 8 …), silently corrupting the manuscript.
  it("is stable across repeated save/load round trips", () => {
    const cases = [
      "첫 문장\n\n둘째 문장",
      "첫 문장\n\n\n\n둘째 문장",
      "한 문단뿐",
      "",
    ];

    for (const original of cases) {
      let text = original;
      for (let i = 0; i < 5; i += 1) {
        text = docToTextLike(textToDoc(text));
      }
      expect(text).toBe(original);
    }
  });
});
