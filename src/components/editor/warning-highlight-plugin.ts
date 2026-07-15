import { Extension } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { InlineWarning } from "@/types";

export const warningPluginKey = new PluginKey("warningHighlight");

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * doc.textContent 내 offset을 ProseMirror document position으로 변환.
 */
function textOffsetToDocPos(doc: PmNode, offset: number): number {
  let textSoFar = 0;
  let result = -1;

  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (result !== -1) return;

    if (node.isText && node.text) {
      const start = textSoFar;
      const end = start + node.text.length;
      if (offset >= start && offset <= end) {
        result = pos + (offset - start);
      }
      textSoFar = end;
    }
  });

  return result;
}

function buildDecorations(
  doc: PmNode,
  warnings: InlineWarning[]
): DecorationSet {
  if (warnings.length === 0) return DecorationSet.empty;

  const decorations: Decoration[] = [];
  const fullText = doc.textContent;

  for (const warning of warnings) {
    if (!warning.matchedText || warning.matchedText.length === 0) continue;

    const regex = new RegExp(escapeRegex(warning.matchedText), "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(fullText)) !== null) {
      const from = textOffsetToDocPos(doc, match.index);
      const to = textOffsetToDocPos(doc, match.index + match[0].length);

      if (from !== -1 && to !== -1) {
        decorations.push(
          Decoration.inline(from, to, {
            class: `warning-${warning.severity}`,
            "data-warning-id": warning.id,
          })
        );
      }
      // 첫 번째 매치만 하이라이트
      break;
    }
  }

  return DecorationSet.create(doc, decorations);
}

export interface WarningHighlightStorage {
  warnings: InlineWarning[];
}

export const WarningHighlightExtension = Extension.create<
  Record<string, never>,
  WarningHighlightStorage
>({
  name: "warningHighlight",

  addStorage() {
    return {
      warnings: [],
    };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;

    return [
      new Plugin({
        key: warningPluginKey,

        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldDecos) {
            // 문서가 변경되면 데코레이션 클리어 (수동 트리거이므로 stale)
            if (tr.docChanged) {
              storage.warnings = [];
              return DecorationSet.empty;
            }

            // setWarnings meta가 있으면 새 데코레이션 빌드
            const newWarnings = tr.getMeta(warningPluginKey);
            if (newWarnings !== undefined) {
              storage.warnings = newWarnings;
              return buildDecorations(tr.doc, newWarnings);
            }

            return oldDecos;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

/**
 * 에디터에 warnings 적용.
 */
export function setEditorWarnings(
  editor: Editor | null,
  warnings: InlineWarning[]
) {
  if (!editor) return;
  const tr = editor.view.state.tr.setMeta(warningPluginKey, warnings);
  editor.view.dispatch(tr);
}
