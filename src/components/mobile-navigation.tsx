"use client";

import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";

export function MobileNavigation() {
  const pathname = usePathname();
  const { toggleSidebar, openMobile } = useSidebar();
  if (pathname === "/projects") return null;

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-sw-border-default bg-sw-bg-surface px-3 pt-[env(safe-area-inset-top)] md:hidden">
      <button type="button" onClick={toggleSidebar} aria-label="메뉴와 회차 목록 열기" aria-expanded={openMobile}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-sw-text-primary focus-visible:outline-2 focus-visible:outline-sw-accent">
        <Menu className="size-5" />
      </button>
      <span className="text-sm font-semibold text-sw-text-primary">Smart Writer</span>
    </header>
  );
}
