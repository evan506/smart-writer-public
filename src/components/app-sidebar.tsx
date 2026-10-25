"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarSeparator,
  SidebarGroup, SidebarMenu, SidebarMenuItem, SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { AppSidebarHeader } from "./app-sidebar/sidebar-header";
import { CodexSidebarStats } from "./app-sidebar/codex-sidebar-stats";
import { ProjectNav } from "./app-sidebar/project-nav";
import { UserFooter } from "./app-sidebar/user-footer";
import { extractProjectId } from "./app-sidebar/utils";
import { WriteChapterSidebar } from "./app-sidebar/write-chapter-sidebar";

export function AppSidebar({ userEmail, isAdmin = false }: { userEmail: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const projectId = extractProjectId(pathname);
  const { state, isMobile, toggleSidebar } = useSidebar();
  const expanded = isMobile || state === "expanded";

  // /projects 정확히 → 사이드바 없음
  if (pathname === "/projects") return null;

  const isCodex =
    projectId !== null && pathname === `/projects/${projectId}/codex`;
  const isWrite =
    projectId !== null && pathname === `/projects/${projectId}/write`;
  const isPlanning =
    projectId !== null && pathname === `/projects/${projectId}/planning`;

  return (
    <Sidebar collapsible="icon">
      <AppSidebarHeader expanded={expanded} onToggle={toggleSidebar} />

      <SidebarContent>
        <ProjectNav
          projectId={projectId}
          isWrite={isWrite}
          isCodex={isCodex}
          isPlanning={isPlanning}
        />
        {isAdmin && <SidebarGroup><SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild isActive={pathname === "/admin"}><Link href="/admin"><ShieldCheck className="size-4" /><span>AI 운영 현황</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu></SidebarGroup>}
        <SidebarSeparator />
        {isWrite && projectId && <WriteChapterSidebar expanded={expanded} />}
        {isCodex && projectId && <CodexSidebarStats projectId={projectId} />}
      </SidebarContent>

      <UserFooter userEmail={userEmail} expanded={expanded} />
    </Sidebar>
  );
}
