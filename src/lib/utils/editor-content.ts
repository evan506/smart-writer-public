import type { JSONContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";

/**
 * Plain text를 Tiptap JSON document로 변환.
 *
 * 구분자는 반드시 `docToText`의 역함수여야 한다. Tiptap `getText()`는 블록을
 * `"\n\n"`(기본 blockSeparator)로 잇고, 이는 `chunking.service`가 문단을 나눌 때
 * 쓰는 `/\n\n+/`와도 일치하는 정식 형식이다. 여기서 `"\n"`으로 나누면 문단 사이마다
 * 빈 paragraph가 하나씩 끼고, 그 빈 paragraph가 다음 저장 때 또 `"\n\n"`를 뱉어
 * 왕복할 때마다 빈 줄이 2배로 늘어난다.
 */
export function textToDoc(text: string): JSONContent {
  const blocks = text.split("\n\n");
  const content: JSONContent[] = blocks.map((block) => {
    if (block.length === 0) {
      return { type: "paragraph" };
    }
    return {
      type: "paragraph",
      content: [{ type: "text", text: block }],
    };
  });

  return { type: "doc", content };
}

/**
 * Tiptap editor에서 plain text 추출.
 */
export function docToText(editor: Editor): string {
  return editor.getText();
}
