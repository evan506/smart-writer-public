import { extractClassificationContextSnippets, extractContextSnippets } from "./snippet-policy";

/** Share only identical windows within a batch; never merge or shorten source text. */
export function buildClassificationBatchContext(candidates: string[], sourceText: string) {
  const rows = candidates.map((name) => ({
    name,
    snippets: extractClassificationContextSnippets(sourceText, name),
  }));
  const snippetMap = new Map<string, string>();
  for (const row of rows) {
    // Downstream type normalization needs the original narrow evidence sentence,
    // not neighbouring LLM context that may describe a different group.
    const fallback = extractContextSnippets(sourceText, row.name, 1)[0];
    if (fallback) snippetMap.set(row.name, fallback);
  }

  // Keep the existing inline representation when sharing has no size benefit.
  const inline = rows.map(({ name, snippets }) => {
    const context = snippets.length
      ? snippets.map((snippet) => `  "${snippet.replace(/"/g, "'")}"`).join("\n")
      : "  (스니펫 없음)";
    return `- **${name}**\n${context}`;
  }).join("\n\n");

  const ids = new Map<string, number>();
  const windows: { id: number; text: string }[] = [];
  const references = rows.map(({ name, snippets }) => ({
    name,
    window_ids: snippets.map((text) => {
      let id = ids.get(text);
      if (id === undefined) {
        id = windows.length + 1;
        ids.set(text, id);
        windows.push({ id, text });
      }
      return id;
    }),
  }));
  // Validate each generated reference against its original candidate window.
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows[i].snippets.length; j++) {
      if (windows[references[i].window_ids[j] - 1]?.text !== rows[i].snippets[j]) {
        throw new Error("Invalid classification context reference");
      }
    }
  }

  const shared = "입력 형식: windows의 id는 원문 창 번호, candidates의 window_ids는 해당 후보의 원문 창 번호 목록입니다. 빈 목록은 근거 창 없음입니다.\n" +
    JSON.stringify({ windows, candidates: references });
  const useShared = shared.length < inline.length;
  return { payload: useShared ? shared : inline, snippetMap, mode: useShared ? "shared" as const : "inline" as const };
}

/** Product input remains byte-identical to the pinned main inline sentence format. */
export function buildProductClassificationBatchContext(candidates: string[], sourceText: string) {
  const snippetMap = new Map<string, string>();
  const payload = candidates.map((name) => {
    const snippets = extractContextSnippets(sourceText, name);
    if (snippets[0]) snippetMap.set(name, snippets[0]);
    const snippetText = snippets.length > 0
      ? snippets.map((s) => `  "${s.replace(/"/g, "'")}"`).join("\n")
      : "  (스니펫 없음)";
    return `- **${name}**\n${snippetText}`;
  }).join("\n\n");
  return { payload, snippetMap, mode: "inline" as const };
}
