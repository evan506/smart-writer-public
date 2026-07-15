import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { GenreKitCard } from "@/components/genre-kit-card";
import { CreateGenreKitDialog } from "@/components/create-genre-kit-dialog";
import { EmptyState } from "@/components/empty-state";
import { Sparkles } from "lucide-react";
import type { GenreKit } from "@/types";

export default async function GenreKitsPage() {
  const supabase = await createClient();

  const [{ data }, { data: { user } }] = await Promise.all([
    supabase.from("genre_kits").select("*").order("name"),
    supabase.auth.getUser(),
  ]);

  const kits = (data ?? []) as GenreKit[];

  return (
    <div className="min-h-screen bg-sw-bg-base text-sw-text-primary">
      <PageHeader title="장르 킷" description="장르별 일관성 규칙 템플릿을 관리하세요">
        <CreateGenreKitDialog />
      </PageHeader>

      <div className="p-6">
        {kits.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="장르 킷이 없습니다"
            description="새 장르 킷을 추가하세요"
          >
            <CreateGenreKitDialog />
          </EmptyState>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {kits.map((kit) => (
              <GenreKitCard
                key={kit.id}
                kit={kit}
                isOwner={!!user && kit.user_id === user.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
