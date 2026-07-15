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

function buildDecorations(
  doc: PmNode,
  entities: EntityHighlightItem[],
  selectedEntityId: string | null = null
): DecorationSet {
  if (entities.length === 0) return DecorationSet.empty;

  // Flatten name + aliases into match entries, filter empty strings
  const nameEntries: { entity: EntityHighlightItem; match: string }[] = [];
  for (const e of entities) {
    if (e.name.trim()) {
      nameEntries.push({ entity: e, match: e.name.trim() });
    }
    for (const alias of e.aliases) {
      if (alias.trim()) {
        nameEntries.push({ entity: e, match: alias.trim() });
      }
    }
  }
  if (nameEntries.length === 0) return DecorationSet.empty;

  // Sort longest first so longer names match before shorter aliases
  nameEntries.sort((a, b) => b.match.length - a.match.length);

  const fullText = doc.textContent;
  if (!fullText) return DecorationSet.empty;

  const index = buildTextIndex(doc);
  const decorations: Decoration[] = [];

  // Track covered text ranges to avoid overlapping decorations
  const covered: [number, number][] = [];

  for (const { entity, match: name } of nameEntries) {
    const type = entity.type;
    const style = ENTITY_STYLES[type] ?? { bg: "rgba(148,163,184,0.12)", border: "#94a3b8" };
    const regex = new RegExp(escapeRegex(name), "g");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(fullText)) !== null) {
      const tStart = match.index;
      const tEnd = tStart + match[0].length;

      // Skip if overlapping with an already decorated range
      if (covered.some(([s, e]) => tStart < e && tEnd > s)) continue;

      const from = textOffsetToPos(index, tStart);
      const to = textOffsetToPos(index, tEnd);

      if (from !== -1 && to !== -1 && from < to) {
        const isSelected = entity.id === selectedEntityId;
        covered.push([tStart, tEnd]);
        decorations.push(
          Decoration.inline(from, to, {
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
            "data-entity-match": name,
            "data-entity-selected": isSelected ? "true" : "false",
          })
        );
      }
    }
  }

  if (decorations.length === 0) return DecorationSet.empty;
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
            };
          },

          apply(tr, prev): EntityPluginState {
            const incoming = tr.getMeta(
              entityHighlightPluginKey
            ) as EntityHighlightPayload | undefined;
            const payload = normalizePayload(incoming, prev.selectedEntityId);

            // Entities updated via setEntityHighlights()
            if (payload) {
              return {
                entities: payload.entities,
                selectedEntityId: payload.selectedEntityId,
                decos: buildDecorations(
                  tr.doc,
                  payload.entities,
                  payload.selectedEntityId
                ),
              };
            }

            // Doc changed — re-apply current entities
            if (tr.docChanged && prev.entities.length > 0) {
              return {
                entities: prev.entities,
                selectedEntityId: prev.selectedEntityId,
                decos: buildDecorations(
                  tr.doc,
                  prev.entities,
                  prev.selectedEntityId
                ),
              };
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
