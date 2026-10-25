import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { WriteSidebarProvider } from "@/components/write/write-sidebar-context";
import { MobileNavigation } from "@/components/mobile-navigation";

export default async function WriteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      {/* Write workspace fonts */}
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
      />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Noto+Serif+KR:wght@400;500;600;700&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap"
      />
      <WriteSidebarProvider>
        <SidebarProvider defaultOpen={true}>
          <AppSidebar userEmail={user.email ?? ""} />
          <main className="flex h-dvh min-w-0 flex-1 flex-col overflow-hidden bg-sw-bg-base font-sw-sans text-sw-text-secondary">
            <MobileNavigation />
            {children}
          </main>
        </SidebarProvider>
      </WriteSidebarProvider>
    </>
  );
}
