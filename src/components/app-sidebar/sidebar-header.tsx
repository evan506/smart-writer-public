"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight, PenTool } from "lucide-react";
import { SidebarHeader } from "@/components/ui/sidebar";

interface AppSidebarHeaderProps {
  expanded: boolean;
  onToggle: () => void;
}

export function AppSidebarHeader({ expanded, onToggle }: AppSidebarHeaderProps) {
  return (
    <SidebarHeader className="!p-0">
      <div
        className="flex items-center px-3 py-3"
        style={{
          minHeight: "48px",
          justifyContent: expanded ? "space-between" : "center",
        }}
      >
        {expanded ? (
          <>
            <Link href="/projects" className="flex items-center gap-2 min-w-0">
              <PenTool
                className="size-4 shrink-0"
                style={{ color: "var(--sw-accent)" }}
              />
              <span
                className="text-sm font-bold truncate"
                style={{ color: "var(--sw-text-primary)" }}
              >
                Smart Writer
              </span>
            </Link>
            <button
              onClick={onToggle}
              className="flex size-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-sw-bg-hover"
              style={{ color: "var(--sw-text-dim)" }}
              title="사이드바 접기"
            >
              <ChevronLeft className="size-3.5" />
            </button>
          </>
        ) : (
          <button
            onClick={onToggle}
            className="flex size-6 items-center justify-center rounded transition-colors hover:bg-sw-bg-hover"
            style={{ color: "var(--sw-text-dim)" }}
            title="사이드바 펼치기"
          >
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
    </SidebarHeader>
  );
}
