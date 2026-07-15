"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  forwardRef,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  WarningHighlightExtension,
  setEditorWarnings,
} from "@/components/editor/warning-highlight-plugin";
import {
  EntityHighlightExtension,
  applyEntityHighlights,
} from "@/components/editor/entity-highlight-plugin";
import type { EntityHighlightItem } from "@/components/editor/entity-highlight-plugin";
import { textToDoc } from "@/lib/utils/editor-content";
import { getEntityTypeConfig } from "@/lib/design-tokens";
import type { InlineWarning } from "@/types";

export interface TiptapEditorRef {
  getEditor: () => Editor | null;
  getContainer: () => HTMLDivElement | null;
}

interface TiptapEditorProps {
  initialContent: string;
  onUpdate: (text: string) => void;
  warnings: InlineWarning[];
  entities?: EntityHighlightItem[];
  selectedEntityId?: string | null;
  onEntityClick?: (entityId: string) => void;
}

interface EntityTooltipState {
  entity: EntityHighlightItem;
  match: string;
  x: number;
  y: number;
}

export const TiptapEditor = forwardRef<TiptapEditorRef, TiptapEditorProps>(
  function TiptapEditor(
    {
      initialContent,
      onUpdate,
      warnings,
      entities = [],
      selectedEntityId = null,
      onEntityClick,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [entityTooltip, setEntityTooltip] = useState<EntityTooltipState | null>(null);
    const entityMap = useMemo(
      () => new Map(entities.map((entity) => [entity.id, entity])),
      [entities]
    );

    const editor = useEditor({
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          bold: false,
          italic: false,
          strike: false,
          code: false,
          codeBlock: false,
          blockquote: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          heading: false,
          horizontalRule: false,
        }),
        Placeholder.configure({
          placeholder: "여기에 본문을 작성하세요...",
        }),
        WarningHighlightExtension,
        EntityHighlightExtension,
      ],
      content: textToDoc(initialContent),
      onUpdate: ({ editor: e }) => {
        onUpdate(e.getText());
      },
      editorProps: {
        attributes: {
          class: "min-h-[60vh] outline-none p-0",
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
        },
      },
    });

    useImperativeHandle(ref, () => ({
      getEditor: () => editor,
      getContainer: () => containerRef.current,
    }));

    // warnings가 바뀌면 에디터에 적용
    useEffect(() => {
      if (editor) {
        setEditorWarnings(editor, warnings);
      }
    }, [editor, warnings]);

    // entities가 바뀌면 entity highlight 적용
    useEffect(() => {
      if (editor) {
        applyEntityHighlights(editor, entities, selectedEntityId);
      }
    }, [editor, entities, selectedEntityId]);

    const handleEntityMouseOver = useCallback(
      (event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        const entityEl = target.closest<HTMLElement>("[data-entity-id]");

        if (!entityEl || !containerRef.current?.contains(entityEl)) {
          setEntityTooltip(null);
          return;
        }

        const entityId = entityEl.dataset.entityId;
        if (!entityId) return;

        const entity = entityMap.get(entityId);
        if (!entity) return;

        const rect = entityEl.getBoundingClientRect();
        const tooltipWidth = 280;
        const left = Math.max(12, Math.min(rect.left, window.innerWidth - tooltipWidth - 12));
        const below = rect.bottom + 8;
        const top = below > window.innerHeight - 120 ? Math.max(12, rect.top - 116) : below;

        setEntityTooltip({
          entity,
          match: entityEl.dataset.entityMatch ?? entity.name,
          x: left,
          y: top,
        });
      },
      [entityMap]
    );

    const handleEntityClick = useCallback(
      (event: React.MouseEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        const entityEl = target.closest<HTMLElement>("[data-entity-id]");
        if (!entityEl || !containerRef.current?.contains(entityEl)) return;

        const entityId = entityEl.dataset.entityId;
        if (!entityId) return;

        onEntityClick?.(entityId);
      },
      [onEntityClick]
    );

    return (
      <div
        ref={containerRef}
        onMouseOver={handleEntityMouseOver}
        onPointerOver={handleEntityMouseOver}
        onMouseLeave={() => setEntityTooltip(null)}
        onPointerLeave={() => setEntityTooltip(null)}
        onClick={handleEntityClick}
      >
        <EditorContent editor={editor} />
        <EntityPreviewTooltip tooltip={entityTooltip} />
      </div>
    );
  }
);

function EntityPreviewTooltip({
  tooltip,
}: {
  tooltip: EntityTooltipState | null;
}) {
  if (!tooltip) return null;

  const { entity, match, x, y } = tooltip;
  const typeConfig = getEntityTypeConfig(entity.type);
  const isAlias = match !== entity.name;

  return (
    <div
      className="fixed z-50 w-[280px] rounded-md p-3 shadow-xl"
      style={{
        left: x,
        top: y,
        background: "rgba(18,21,28,0.98)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "#e8eaf0",
        pointerEvents: "none",
      }}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="truncate text-sm font-semibold">{entity.name}</span>
        <span
          className="shrink-0 rounded-[3px] px-1.5 py-px text-[9px] font-semibold"
          style={{
            background: typeConfig.bg,
            color: typeConfig.color,
          }}
        >
          {typeConfig.label}
        </span>
      </div>
      {isAlias && (
        <div className="mb-1 text-[10px]" style={{ color: "#7b8297" }}>
          별칭: {match}
        </div>
      )}
      <p className="line-clamp-3 text-xs leading-5" style={{ color: "#a0aabe" }}>
        {entity.summary?.trim() || "아직 요약이 없습니다."}
      </p>
    </div>
  );
}
