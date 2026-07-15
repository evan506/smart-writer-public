import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { DesktopOnlyOverlay } from "@/components/desktop-only-overlay";

export default async function DashboardLayout({
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
      <DesktopOnlyOverlay />
      <SidebarProvider>
        <AppSidebar userEmail={user.email ?? ""} />
        <main className="flex-1 overflow-y-auto overflow-x-hidden relative sw-scrollbar">{children}</main>
      </SidebarProvider>
    </>
  );
}
