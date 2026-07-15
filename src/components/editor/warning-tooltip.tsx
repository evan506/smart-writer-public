"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import type { InlineWarning } from "@/types";

const SEVERITY_LABELS = {
  high: "높음",
  medium: "보통",
  low: "낮음",
} as const;

const SEVERITY_COLORS = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-blue-100 text-blue-800 border-blue-200",
} as const;

interface TooltipState {
  warning: InlineWarning;
  x: number;
  y: number;
}

export function WarningTooltip({
  containerRef,
  warnings,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  warnings: InlineWarning[];
}) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleMouseOver = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const warningEl = target.closest<HTMLElement>("[data-warning-id]");

      if (warningEl) {
        const id = warningEl.getAttribute("data-warning-id");
        const warning = warnings.find((w) => w.id === id);
        if (warning) {
          const rect = warningEl.getBoundingClientRect();
          setTooltip({
            warning,
            x: rect.left,
            y: rect.bottom + 4,
          });
          return;
        }
      }

      // 마우스가 tooltip 자체 위에 있으면 유지
      if (tooltipRef.current?.contains(target)) return;

      setTooltip(null);
    },
    [warnings]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mouseover", handleMouseOver);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      container.removeEventListener("mouseover", handleMouseOver);
      container.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [containerRef, handleMouseOver, handleMouseLeave]);

  if (!tooltip) return null;

  return (
    <div
      ref={tooltipRef}
      className="fixed z-50 max-w-sm rounded-lg border bg-popover p-3 shadow-lg"
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Badge
          variant="outline"
          className={SEVERITY_COLORS[tooltip.warning.severity]}
        >
          {SEVERITY_LABELS[tooltip.warning.severity]}
        </Badge>
        <Badge variant="outline" className="text-xs">
          {tooltip.warning.type}
        </Badge>
        {tooltip.warning.source === "ai" && (
          <Badge variant="secondary" className="text-xs">
            확인 후보
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium mb-1">{tooltip.warning.entityName}</p>
      <p className="text-sm text-muted-foreground">{tooltip.warning.detail}</p>
      {tooltip.warning.suggestion && (
        <p className="text-sm text-muted-foreground mt-1.5 border-t pt-1.5">
          제안: {tooltip.warning.suggestion}
        </p>
      )}
    </div>
  );
}
