import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Demo credentials are env-only and fail closed. Never ship a default here:
// /demo is a PUBLIC route (see PUBLIC_ROUTES in src/lib/supabase/middleware.ts),
// so a hardcoded fallback would be a one-click login for anyone.
const DEMO_EMAIL = process.env.DEMO_LOGIN_EMAIL;
const DEMO_PASSWORD = process.env.DEMO_LOGIN_PASSWORD;

export async function GET(request: Request) {
  const { origin } = new URL(request.url);

  if (!DEMO_EMAIL || !DEMO_PASSWORD) {
    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent("데모 계정이 설정되지 않았습니다")}`
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?message=${encodeURIComponent("데모 계정 로그인에 실패했습니다")}`
    );
  }

  const { data: projects } = await supabase
    .from("projects")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  const projectId = projects?.[0]?.id;
  if (!projectId) {
    return NextResponse.redirect(`${origin}/projects`);
  }

  const { data: chapters } = await supabase
    .from("chapters")
    .select("id")
    .eq("project_id", projectId)
    .order("chapter_num", { ascending: true })
    .limit(1);

  const chapterId = chapters?.[0]?.id;
  const destination = chapterId
    ? `/projects/${projectId}/write?chapter=${chapterId}`
    : `/projects/${projectId}/write`;

  return NextResponse.redirect(`${origin}${destination}`);
}
