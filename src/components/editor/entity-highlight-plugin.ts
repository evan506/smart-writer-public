import { Extension } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Node as PmNode } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { ENTITY_TYPE_CONFIG } from "@/lib/design-tokens";

// ── Types ──

export interface EntityHighlightItem {
  id: string;
  name: string;
  type: string;
  aliases: string[];
  summary?: string | null;
}

// ── Entity type → { bg, border } highlight styles ──
// Derived from ENTITY_TYPE_CONFIG in design-tokens.ts (border = .color, bg = .accent)
// to avoid duplicating the same hex values in two places.
//
// NOTE: CONCEPT is a known exception — its previous hardcoded bg
// ("rgba(125,211,168,0.18)") does NOT match ENTITY_TYPE_CONFIG.CONCEPT.accent
// ("rgba(160,170,190,0.25)"); it reuses PLACE's color at a different opacity.
// Kept as a literal override here to preserve exact prior rendering rather than
// silently changing the highlight color; flagged as a design-tokens
// inconsistency to resolve separately.
const ENTITY_STYLES: Record<string, { bg: string; border: string }> = {
  CHARACTER:    { bg: ENTITY_TYPE_CONFIG.CHARACTER.accent, border: ENTITY_TYPE_CONFIG.CHARACTER.color },
  ORGANIZATION: { bg: ENTITY_TYPE_CONFIG.ORGANIZATION.accent, border: ENTITY_TYPE_CONFIG.ORGANIZATION.color },
  PLACE:        { bg: ENTITY_TYPE_CONFIG.PLACE.accent, border: ENTITY_TYPE_CONFIG.PLACE.color },
  ITEM:         { bg: ENTITY_TYPE_CONFIG.ITEM.accent, border: ENTITY_TYPE_CONFIG.ITEM.color },
  CONCEPT:      { bg: "rgba(125,211,168,0.18)", border: ENTITY_TYPE_CONFIG.CONCEPT.color },
  MAGIC_SYSTEM: { bg: ENTITY_TYPE_CONFIG.MAGIC_SYSTEM.accent, border: ENTITY_TYPE_CONFIG.MAGIC_SYSTEM.color },
};

// ── Plugin key ──

export const entityHighlightPluginKey = new PluginKey<EntityPluginState>(
  "entityHighlight"
);

// ── Plugin state shape ──

interface EntityPluginState {
  entities: EntityHighlightItem[];
  selectedEntityId: string | null;
  decos: DecorationSet;
  matchers: NameMatcher[];
}

type EntityHighlightPayload =
  | EntityHighlightItem[]
  | {
      entities: EntityHighlightItem[];
      selectedEntityId?: string | null;
    };

// ── Helpers ──

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a compact text-offset → ProseMirror-pos lookup index.
 * O(N) to build, O(log N) per lookup.
 */
interface TextNodeEntry {
  docPos: number;
  textStart: number;
  textEnd: number;
}

function buildTextIndex(doc: PmNode): TextNodeEntry[] {
  const entries: TextNodeEntry[] = [];
  let offset = 0;
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isText && node.text) {
      entries.push({
        docPos: pos,
        textStart: offset,
        textEnd: offset + node.text.length,
      });
      offset += node.text.length;
    } else if (node.isLeaf) {
      // Match textBetween's one-character boundary for inline leaves (hard breaks).
      offset += 1;
    }
  });
  return entries;
}

function textOffsetToPos(index: TextNodeEntry[], offset: number): number {
  let lo = 0;
  let hi = index.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const n = index[mid];
    if (offset < n.textStart) {
      hi = mid - 1;
    } else if (offset > n.textEnd) {
      lo = mid + 1;
    } else {
      return n.docPos + (offset - n.textStart);
    }
  }
  return -1;
}

// ── Core: build DecorationSet from entities ──

interface NameMatcher {
  entity: EntityHighlightItem;
  regex: RegExp;
}

function compileMatchers(entities: EntityHighlightItem[]): NameMatcher[] {
  const entries = entities.flatMap((entity) => [entity.name, ...entity.aliases]
    .map((name) => name.trim()).filter(Boolean)
    .map((name) => ({ entity, name })));
  entries.sort((a, b) => b.name.length - a.name.length);
  return entries.map(({ entity, name }) => ({ entity, regex: new RegExp(escapeRegex(name), "g") }));
}

// Match within text blocks so names cannot span unrelated paragraphs.
function buildBlockDecorations(
  block: PmNode,
  blockPos: number,
  matchers: NameMatcher[],
  selectedEntityId: string | null
): Decoration[] {
  const fullText = block.textBetween(0, block.content.size, "", "\n");
  if (!fullText) return [];

  const index = buildTextIndex(block);
  const decorations: Decoration[] = [];

  // Track covered text ranges to avoid overlapping decorations
  const covered = new Uint8Array(fullText.length);

  for (const { entity, regex } of matchers) {
    const type = entity.type;
    const style = ENTITY_STYLES[type] ?? { bg: "rgba(148,163,184,0.12)", border: "#94a3b8" };
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(fullText)) !== null) {
      const tStart = match.index;
      const tEnd = tStart + match[0].length;

      // Skip if overlapping with an already decorated range
      if (covered.subarray(tStart, tEnd).some(Boolean)) continue;

      const from = textOffsetToPos(index, tStart);
      const to = textOffsetToPos(index, tEnd);

      if (from !== -1 && to !== -1 && from < to) {
        const isSelected = entity.id === selectedEntityId;
        covered.fill(1, tStart, tEnd);
        decorations.push(
          Decoration.inline(blockPos + 1 + from, blockPos + 1 + to, {
            style: [
              `background: ${isSelected ? "rgba(255,255,255,0.12)" : style.bg}`,
              `text-decoration-line: underline`,
              `text-decoration-color: ${style.border}`,
              `text-decoration-thickness: ${isSelected ? "3px" : "2px"}`,
              `text-underline-offset: 0.18em`,
              `border-radius: 2px`,
              `cursor: pointer`,
              isSelected ? `box-shadow: inset 0 -0.18em 0 ${style.bg}` : "",
            ].filter(Boolean).join("; "),
            "data-entity-id": entity.id,
            "data-entity-name": entity.name,
            "data-entity-type": type,
            "data-entity-match": match[0],
            "data-entity-selected": isSelected ? "true" : "false",
          })
        );
      }
    }
  }

  return decorations;
}

function buildDecorations(
  doc: PmNode,
  matchers: NameMatcher[],
  selectedEntityId: string | null
): DecorationSet {
  if (matchers.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    decorations.push(...buildBlockDecorations(node, pos, matchers, selectedEntityId));
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

function normalizePayload(
  incoming: EntityHighlightPayload | undefined,
  fallbackSelectedEntityId: string | null
): { entities: EntityHighlightItem[]; selectedEntityId: string | null } | null {
  if (incoming === undefined) return null;
  if (Array.isArray(incoming)) {
    return { entities: incoming, selectedEntityId: fallbackSelectedEntityId };
  }
  return {
    entities: incoming.entities,
    selectedEntityId: incoming.selectedEntityId ?? null,
  };
}

// ── TipTap Extension ──

export const EntityHighlightExtension = Extension.create({
  name: "entityHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<EntityPluginState>({
        key: entityHighlightPluginKey,

        state: {
          init(): EntityPluginState {
            return {
              entities: [],
              selectedEntityId: null,
              decos: DecorationSet.empty,
              matchers: [],
            };
          },

          apply(tr, prev): EntityPluginState {
            const incoming = tr.getMeta(
              entityHighlightPluginKey
            ) as EntityHighlightPayload | undefined;
            const payload = normalizePayload(incoming, prev.selectedEntityId);

            // Entities updated via setEntityHighlights()
            if (payload) {
              const matchers = payload.entities === prev.entities ? prev.matchers : compileMatchers(payload.entities);
              return {
                entities: payload.entities,
                selectedEntityId: payload.selectedEntityId,
                matchers,
                decos: buildDecorations(
                  tr.doc,
                  matchers,
                  payload.selectedEntityId
                ),
              };
            }

            // Map unaffected decorations; only rescan text blocks touched by steps.
            if (tr.docChanged && prev.matchers.length > 0) {
              const ranges: { from: number; to: number }[] = [];
              tr.mapping.maps.forEach((map, i) => {
                const remaining = tr.mapping.slice(i + 1);
                map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
                  ranges.push({ from: remaining.map(newStart, -1), to: remaining.map(newEnd, 1) });
                });
              });
              // A custom step without ranges still needs a complete refresh.
              if (ranges.length === 0) {
                return { ...prev, decos: buildDecorations(tr.doc, prev.matchers, prev.selectedEntityId) };
              }
              let decos = prev.decos.map(tr.mapping, tr.doc);
              const additions: Decoration[] = [];
              const removals: Decoration[] = [];
              tr.doc.descendants((node, pos) => {
                if (!node.isTextblock) return;
                if (ranges.some(({ from, to }) => pos <= to && pos + node.nodeSize >= from)) {
                  removals.push(...decos.find(pos, pos + node.nodeSize));
                  additions.push(...buildBlockDecorations(node, pos, prev.matchers, prev.selectedEntityId));
                }
                return false;
              });
              decos = decos.remove(removals).add(tr.doc, additions);
              return { ...prev, decos };
            }

            return prev;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state)?.decos;
          },
        },
      }),
    ];
  },
});

// ── Public helper: push entity data into the editor ──

export function applyEntityHighlights(
  editor: Editor | null,
  entities: EntityHighlightItem[],
  selectedEntityId: string | null = null
) {
  if (!editor || editor.isDestroyed) return;
  const tr = editor.view.state.tr.setMeta(entityHighlightPluginKey, {
    entities,
    selectedEntityId,
  });
  editor.view.dispatch(tr);
}
