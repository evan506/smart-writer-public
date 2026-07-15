"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/app/(auth)/actions";
import { SidebarFooter } from "@/components/ui/sidebar";

interface UserFooterProps {
  userEmail: string;
  expanded: boolean;
}

export function UserFooter({ userEmail, expanded }: UserFooterProps) {
  return (
    <SidebarFooter>
      <div className="flex items-center gap-2 px-2 py-2">
        {expanded && (
          <span className="min-w-0 flex-1 truncate text-xs text-[#8b90a0]">
            {userEmail}
          </span>
        )}
        <form action={logout}>
          <button
            type="submit"
            className="flex shrink-0 items-center gap-1 text-xs text-[#8b90a0] transition-colors hover:text-[#e8eaf0]"
            title="로그아웃"
          >
            <LogOut className="size-3.5" />
          </button>
        </form>
      </div>
    </SidebarFooter>
  );
}
