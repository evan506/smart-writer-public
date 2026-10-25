// @vitest-environment jsdom
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { applyEntityHighlights, EntityHighlightExtension, entityHighlightPluginKey } from "@/components/editor/entity-highlight-plugin";
import { textToDoc } from "@/lib/utils/editor-content";

const editors: Editor[] = [];
const entities = [
  { id: "a", name: "유하린", type: "CHARACTER", aliases: ["하린", "검성"] },
  { id: "b", name: "검", type: "ITEM", aliases: ["a+b"] },
];
function mount(text: string) {
  const editor = new Editor({ extensions: [StarterKit, EntityHighlightExtension], content: textToDoc(text) });
  editors.push(editor);
  applyEntityHighlights(editor, entities);
  return editor;
}
function snapshot(editor: Editor) {
  return entityHighlightPluginKey.getState(editor.state)!.decos.find().map(d => ({
    from: d.from, to: d.to, text: editor.state.doc.textBetween(d.from,d.to),
  }));
}
function expectFreshEquivalent(editor: Editor) {
  const incremental = snapshot(editor);
  applyEntityHighlights(editor, entities);
  expect(snapshot(editor)).toEqual(incremental);
}
afterEach(() => { editors.splice(0).forEach(e => e.destroy()); });

describe("entity highlights through document edits", () => {
  it("treats Shift+Enter as a name boundary and positions names after it correctly", () => {
    const editor = mount("");
    editor.commands.setContent("<p>유하<br>린</p><p>다른<br>유하린</p>");
    const matches = snapshot(editor);
    expect(matches.map(d => d.text)).toEqual(["유하린"]);
    const expectedStart = editor.state.doc.child(0).nodeSize + 1 + 2 + 1;
    expect(matches[0].from).toBe(expectedStart);
    expect(matches[0].to).toBe(expectedStart + 3);
    expectFreshEquivalent(editor);
    editor.commands.setTextSelection(3);
    editor.commands.deleteSelection();
    editor.view.dispatch(editor.state.tr.delete(3,4));
    expectFreshEquivalent(editor);
    expect(snapshot(editor).map(d => d.text)).toEqual(["유하린", "유하린"]);
  });

  it("does not join names across separate paragraphs", () => {
    const editor = mount("유하\n\n린");
    expect(snapshot(editor)).toEqual([]);
  });
  it("matches a full rebuild after a deterministic series of arbitrary replacements", () => {
    const editor = mount("유하린은 검을 들었다.\n\n검성은 a+b를 보았다.\n\n하린");
    let seed = 17;
    const random = (max: number) => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % max; };
    const inserts = ["유하린", "검성", "a+b", "", "하린", " "];
    for (let i = 0; i < 80; i++) {
      const end = editor.state.doc.content.size;
      const from = 1 + random(Math.max(1,end-1));
      const to = Math.min(end-1,from+random(5));
      editor.view.dispatch(editor.state.tr.insertText(inserts[random(inserts.length)],from,to));
      expectFreshEquivalent(editor);
    }
  });

  it("prefers long names and aliases, escapes regex and leaves adjacent matches intact", () => {
    const editor = mount("유하린과 검성은 검과 a+b를 보았다.");
    expect(snapshot(editor).map(d => d.text)).toEqual(["유하린", "검성", "검", "a+b"]);
  });
  it("updates created/deleted names and preserves untouched paragraphs after insert/delete", () => {
    const editor = mount("유하린은 왔다.\n\n검성은 검을 들었다.\n\n하린");
    editor.view.dispatch(editor.state.tr.insertText("검성 ",1));
    expectFreshEquivalent(editor);
    editor.view.dispatch(editor.state.tr.delete(4,7));
    expectFreshEquivalent(editor);
  });
  it("handles split, join, replacement, undo and redo", () => {
    const editor = mount("유하린은 검을 들었다.\n\n검성이 왔다.");
    editor.commands.setTextSelection(3);
    editor.commands.splitBlock();
    expectFreshEquivalent(editor);
    editor.commands.undo();
    expectFreshEquivalent(editor);
    editor.commands.redo();
    expectFreshEquivalent(editor);
    editor.commands.setTextSelection(4);
    editor.commands.joinBackward();
    expectFreshEquivalent(editor);
    editor.commands.setContent(textToDoc("검성과 유하린\n\na+b"));
    expectFreshEquivalent(editor);
  });
  it("handles multiple mapped steps and deletion across paragraphs", () => {
    const editor = mount("유하린\n\n검성\n\na+b\n\n검");
    editor.view.dispatch(editor.state.tr.insertText("검 ",1).insertText("하린",12));
    expectFreshEquivalent(editor);
    editor.view.dispatch(editor.state.tr.delete(2,editor.state.doc.content.size-2));
    expectFreshEquivalent(editor);
  });
  it("updates selected styling and replaces removed entities without changing text", () => {
    const editor = mount("유하린은 검을 들었다.");
    applyEntityHighlights(editor,entities,"a");
    expect(editor.view.dom.querySelector('[data-entity-id="a"]')?.getAttribute("data-entity-selected")).toBe("true");
    applyEntityHighlights(editor,[]);
    expect(snapshot(editor)).toEqual([]);
    expect(editor.getText()).toBe("유하린은 검을 들었다.");
  });
});
