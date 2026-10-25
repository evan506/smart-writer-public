import { isAdminUser } from "@/lib/auth/admin";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileNavigation } from "@/components/mobile-navigation";

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
      <SidebarProvider>
        <AppSidebar userEmail={user.email ?? ""} isAdmin={isAdminUser(user.id)} />
        <div className="flex h-dvh min-w-0 flex-1 flex-col">
          <MobileNavigation />
          <main className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden sw-scrollbar">{children}</main>
        </div>
      </SidebarProvider>
    </>
  );
}
