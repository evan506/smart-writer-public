"use client";

import { useEffect, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Copy,
  MoreHorizontal,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";

export function ProjectCardMenu({
  projectId,
  onDelete,
}: {
  projectId: string;
  onDelete: () => void;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: globalThis.MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen((value) => !value);
        }}
        className="flex items-center justify-center rounded p-1 transition-colors"
        style={{
          color: "var(--sw-text-ghost)",
          cursor: "pointer",
          background: "transparent",
          border: "none",
        }}
        onMouseEnter={(event) => {
          event.currentTarget.style.color = "var(--sw-text-muted)";
          event.currentTarget.style.background = "var(--sw-bg-hover)";
        }}
        onMouseLeave={(event) => {
          event.currentTarget.style.color = "var(--sw-text-ghost)";
          event.currentTarget.style.background = "transparent";
        }}
        aria-label="프로젝트 메뉴"
      >
        <MoreHorizontal size={14} />
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 top-7 z-50 min-w-[140px] rounded-md py-1"
          style={{
            background: "var(--sw-bg-overlay)",
            border: "1px solid var(--sw-border-hover)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          <MenuItem
            icon={<Pencil size={12} />}
            label="집필하기"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen(false);
              router.push(`/projects/${projectId}/write`);
            }}
          />
          <MenuItem
            icon={<BookOpen size={12} />}
            label="작품 기억"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen(false);
              router.push(`/projects/${projectId}/codex`);
            }}
          />
          <MenuDivider />
          <MenuItem icon={<Settings size={12} />} label="프로젝트 설정" disabled />
          <MenuItem icon={<Copy size={12} />} label="복제" disabled />
          <MenuDivider />
          <MenuItem
            icon={<Trash2 size={12} />}
            label="삭제"
            danger
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen(false);
              onDelete();
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuDivider() {
  return (
    <div
      className="my-1"
      style={{
        height: 1,
        background: "var(--sw-border-default)",
      }}
    />
  );
}

function MenuItem({
  icon,
  label,
  danger,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  onClick?: (event: ReactMouseEvent) => void;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-semibold transition-colors"
      style={{
        color: disabled
          ? "var(--sw-text-ghost)"
          : danger
            ? "var(--sw-danger)"
            : "var(--sw-text-secondary)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        background: "transparent",
        border: "none",
        borderRadius: "4px",
      }}
      onMouseEnter={(event) => {
        if (!disabled) {
          event.currentTarget.style.background = "var(--sw-bg-hover)";
        }
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = "transparent";
      }}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  );
}
