"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen, Lightbulb, Pencil } from "lucide-react";
import {
  useSidebar,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface ProjectNavProps {
  projectId: string | null;
  isWrite: boolean;
  isCodex: boolean;
  isPlanning: boolean;
}

export function ProjectNav({
  projectId,
  isWrite,
  isCodex,
  isPlanning,
}: ProjectNavProps) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link onClick={() => setOpenMobile(false)} href="/projects">
                <ArrowLeft className="size-4" />
                <span>프로젝트 목록</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {projectId && (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isWrite}>
                  <Link onClick={() => setOpenMobile(false)} href={`/projects/${projectId}/write`}>
                    <Pencil className="size-4" />
                    <span>집필하기</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isPlanning}>
                  <Link onClick={() => setOpenMobile(false)} href={`/projects/${projectId}/planning`}>
                    <Lightbulb className="size-4" />
                    <span>구상하기</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isCodex}>
                  <Link onClick={() => setOpenMobile(false)} href={`/projects/${projectId}/codex`}>
                    <BookOpen className="size-4" />
                    <span>작품 기억</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
