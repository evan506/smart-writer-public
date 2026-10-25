import { notFound, redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { createClient } from "@/lib/supabase/server";
import { loadAdminSnapshot, parseAdminFilters } from "@/lib/services/admin-usage.service";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const result = await loadAdminSnapshot(supabase, parseAdminFilters(await searchParams));
  if (result.kind === "unauthenticated") redirect("/login");
  if (result.kind === "forbidden" || result.kind === "invalid-project") notFound();
  if (result.kind !== "ready") return <div className="min-h-screen bg-sw-bg-base p-10 text-sw-text-primary"><h1 className="text-xl font-bold">운영 현황을 불러올 수 없습니다</h1><p className="mt-3 text-sm text-sw-text-muted">잠시 후 다시 조회해 주세요.</p><form method="get" action="/admin"><button className="mt-4 rounded-md border border-sw-border-subtle px-4 py-2" type="submit">다시 조회</button></form></div>;
  const rawCommit = process.env.VERCEL_GIT_COMMIT_SHA;
  const commit = rawCommit && /^[a-f0-9]{7,40}$/i.test(rawCommit) ? rawCommit : null;
  const environment = ({ production: "운영", preview: "미리보기", development: "개발" } as Record<string, string>)[process.env.VERCEL_ENV ?? ""] ?? "로컬 또는 확인 불가";
  let supabaseUrl: string | null = null;
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    const ref = /^([a-z0-9]+)\.supabase\.co$/.exec(host)?.[1];
    if (ref) supabaseUrl = `https://supabase.com/dashboard/project/${ref}`;
  } catch { /* Missing configuration is shown without leaking its value. */ }
  return <AdminDashboard snapshot={result.snapshot} runtime={{ commit, environment, supabaseUrl }} />;
}
