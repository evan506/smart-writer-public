"use client";

import { Network, type LucideIcon } from "lucide-react";

export function CodexGraphControls({
  showNeighborsOnly,
  selectedEntityId,
  onToggleNeighborsOnly,
}: {
  showNeighborsOnly: boolean;
  selectedEntityId?: string | null;
  onToggleNeighborsOnly: () => void;
}) {
  return (
    <div className="absolute left-3 top-3 z-20 flex gap-1.5">
      <GraphControlButton
        label="주변만"
        title="선택한 항목과 직접 연결된 항목만 보기"
        onClick={onToggleNeighborsOnly}
        icon={Network}
        active={showNeighborsOnly}
        disabled={!selectedEntityId}
      />
    </div>
  );
}

function GraphControlButton({
  icon: Icon,
  label,
  title,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        background: active ? "var(--sw-bg-active)" : "var(--sw-bg-raised)",
        border: `1px solid ${
          active ? "var(--sw-border-focus)" : "var(--sw-border-muted)"
        }`,
        color: active
          ? "var(--sw-accent)"
          : "var(--sw-text-muted)",
      }}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}
