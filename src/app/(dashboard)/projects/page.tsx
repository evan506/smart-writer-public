import { createClient } from "@/lib/supabase/server";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { ProjectCard } from "@/components/project-card";
import type { ProjectCardData } from "@/components/project-card";
import { logout } from "@/app/(auth)/actions";
import type { Project } from "@/types";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const supabase = await createClient();
  const [{ data: projects }, { data: authData }] = await Promise.all([
    supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  const projectIds = (projects ?? []).map((p) => p.id);

  const entityCountMap: Record<string, number> = {};
  const chapterCountMap: Record<string, number> = {};
  const wordCountMap: Record<string, number> = {};
  const pendingCountMap: Record<string, number> = {};
  const lastChapterMap: Record<
    string,
    { chapterNum: number; title: string | null; updatedAt: string }
  > = {};

  if (projectIds.length > 0) {
    const [entitiesRes, chaptersRes, suggestionsRes] = await Promise.all([
      supabase.from("entities").select("project_id").in("project_id", projectIds),
      supabase
        .from("chapters")
        .select("project_id, chapter_num, title, word_count, updated_at")
        .in("project_id", projectIds),
      supabase
        .from("entity_suggestions")
        .select("project_id")
        .eq("status", "PENDING")
        .in("project_id", projectIds),
    ]);

    for (const row of entitiesRes.data ?? []) {
      entityCountMap[row.project_id] =
        (entityCountMap[row.project_id] ?? 0) + 1;
    }
    for (const row of chaptersRes.data ?? []) {
      chapterCountMap[row.project_id] =
        (chapterCountMap[row.project_id] ?? 0) + 1;
      wordCountMap[row.project_id] =
        (wordCountMap[row.project_id] ?? 0) + (row.word_count ?? 0);

      if (row.updated_at) {
        const existing = lastChapterMap[row.project_id];
        if (!existing || row.updated_at > existing.updatedAt) {
          lastChapterMap[row.project_id] = {
            chapterNum: row.chapter_num,
            title: row.title,
            updatedAt: row.updated_at,
          };
        }
      }
    }
    for (const row of suggestionsRes.data ?? []) {
      pendingCountMap[row.project_id] =
        (pendingCountMap[row.project_id] ?? 0) + 1;
    }
  }

  const user = authData?.user;
  const projectList = (projects ?? []) as Project[];

  // Build card data
  const cardDataList: ProjectCardData[] = projectList.map((p) => {
    const lastChapter = lastChapterMap[p.id] ?? null;
    const lastActivityTime = lastChapter?.updatedAt;
    const isRecentlyActive = lastActivityTime
      ? Number(new Date()) - new Date(lastActivityTime).getTime() < 24 * 60 * 60 * 1000
      : false;

    return {
      id: p.id,
      title: p.title,
      genre: p.genre,
      description: p.description,
      entityCount: entityCountMap[p.id] ?? 0,
      chapterCount: chapterCountMap[p.id] ?? 0,
      wordCount: wordCountMap[p.id] ?? 0,
      pendingCount: pendingCountMap[p.id] ?? 0,
      lastChapter,
      isRecentlyActive,
    };
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--sw-bg-base)" }}>
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-sw-border-subtle px-8 py-4">
        <span className="text-lg font-black tracking-tight text-sw-text-primary">
          ✦ Smart Writer
        </span>
        <div className="flex items-center gap-3">
          {user?.email && (
            <span className="text-sm text-sw-text-muted">{user.email}</span>
          )}
          <form action={logout}>
            <button
              type="submit"
              className="text-xs text-sw-text-muted transition-colors hover:text-sw-text-primary"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-[1100px] px-8 py-8">
        {!projectList.length ? (
          <EmptyState />
        ) : (
          <>
            {/* Title row */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1
                  className="text-[22px] font-black tracking-tight"
                  style={{ color: "var(--sw-text-primary)" }}
                >
                  내 프로젝트
                </h1>
                <span
                  className="text-xs"
                  style={{ color: "var(--sw-text-ghost)" }}
                >
                  {projectList.length}개의 프로젝트
                </span>
              </div>
              <CreateProjectDialog />
            </div>

            {/* Card grid */}
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {cardDataList.map((card) => (
                <ProjectCard key={card.id} project={card} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto max-w-[560px] py-20 text-center">
      <div
        className="text-5xl mb-4"
        style={{ color: "var(--sw-accent)", opacity: 0.6 }}
      >
        ✦
      </div>
      <h1
        className="text-2xl font-black mb-2.5"
        style={{ color: "var(--sw-text-primary)" }}
      >
        첫 작품을 시작해보세요
      </h1>
      <p
        className="text-sm mb-7 leading-relaxed"
        style={{ color: "var(--sw-text-muted)" }}
      >
        글을 저장하면 인물, 장소, 관계, 중요한 설정 후보를 찾아드립니다.
        <br />
        챕터가 쌓일수록 작품 기억이 함께 쌓입니다.
      </p>
      <div className="mb-10">
        <CreateProjectDialog />
      </div>

      {/* How it works */}
      <div
        className="text-left rounded-xl p-6"
        style={{
          background: "var(--sw-bg-elevated)",
          border: "1px solid var(--sw-border-default)",
        }}
      >
        <div
          className="text-[13px] font-bold mb-4"
          style={{ color: "var(--sw-text-primary)" }}
        >
          이렇게 동작해요
        </div>
        {[
          {
            step: "1",
            title: "프로젝트 생성",
            desc: "작품 제목과 장르를 선택하세요",
          },
          {
            step: "2",
            title: "챕터 작성과 저장",
            desc: "저장하면 작품 기억 정리가 시작됩니다",
          },
          {
            step: "3",
            title: "기억할 설정 확인",
            desc: "원문에서 찾은 인물, 장소, 관계 후보를 확인하세요",
          },
          {
            step: "4",
            title: "작품 기억 누적",
            desc: "확인한 설정이 작품 기억에 쌓입니다",
          },
        ].map((s, i) => (
          <div
            key={i}
            className="flex gap-3 items-start"
            style={{ marginBottom: i < 3 ? 14 : 0 }}
          >
            <div
              className="flex items-center justify-center shrink-0 rounded-full text-[11px] font-black"
              style={{
                width: 24,
                height: 24,
                background: "var(--sw-accent-bg)",
                border: "1px solid var(--sw-accent-border)",
                color: "var(--sw-accent)",
              }}
            >
              {s.step}
            </div>
            <div>
              <div
                className="text-xs font-bold mb-0.5"
                style={{ color: "var(--sw-text-primary)" }}
              >
                {s.title}
              </div>
              <div
                className="text-[11px] leading-relaxed"
                style={{ color: "var(--sw-text-ghost)" }}
              >
                {s.desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
