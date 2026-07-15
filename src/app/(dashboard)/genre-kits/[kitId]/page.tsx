import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { EditGenreKitDialog } from "@/components/edit-genre-kit-dialog";
import { DeleteGenreKitButton } from "./delete-genre-kit-button";
import { Badge } from "@/components/ui/badge";
import { notFound } from "next/navigation";
import { Globe, Lock, User } from "lucide-react";
import type { GenreKit, GenreRule } from "@/types";
import { RULE_CATEGORIES } from "@/lib/constants";

export default async function GenreKitDetailPage({
  params,
}: {
  params: Promise<{ kitId: string }>;
}) {
  const { kitId } = await params;
  const supabase = await createClient();

  const [{ data }, { data: { user } }] = await Promise.all([
    supabase.from("genre_kits").select("*").eq("id", kitId).single(),
    supabase.auth.getUser(),
  ]);

  if (!data) notFound();

  const kit = data as GenreKit;
  const isOwner = !!user && kit.user_id === user.id;
  const isGlobal = kit.user_id === null;
  const rules = (kit.rules as unknown as GenreRule[]) ?? [];

  // Group rules by category
  const grouped = new Map<string, GenreRule[]>();
  for (const cat of RULE_CATEGORIES) {
    const catRules = rules.filter((r) => r.category === cat);
    if (catRules.length > 0) grouped.set(cat, catRules);
  }
  // Catch any rules with categories not in RULE_CATEGORIES
  const knownCategories = new Set(RULE_CATEGORIES as readonly string[]);
  const otherRules = rules.filter((r) => !knownCategories.has(r.category));
  if (otherRules.length > 0) grouped.set("기타", otherRules);

  return (
    <div className="min-h-screen bg-sw-bg-base text-sw-text-primary">
      <PageHeader title={kit.name} description={`장르 분류: ${kit.genre_type}`}>
        {isOwner ? (
          <>
            <EditGenreKitDialog kit={kit} />
            <DeleteGenreKitButton kitId={kit.id} kitName={kit.name} />
          </>
        ) : (
          <span className="text-sm text-sw-text-secondary">
            {isGlobal ? "공용 장르 킷은 수정할 수 없습니다" : "읽기 전용"}
          </span>
        )}
      </PageHeader>

      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{kit.genre_type}</Badge>
          {isGlobal ? (
            <Badge variant="outline" className="gap-1">
              <Globe className="size-3" />
              공용
            </Badge>
          ) : isOwner ? (
            <Badge variant="outline" className="gap-1">
              <User className="size-3" />
              내 장르 킷
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1">
              <Globe className="size-3" />
              공개
            </Badge>
          )}
          {!isGlobal && isOwner && !kit.is_public && (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" />
              비공개
            </Badge>
          )}
          <span className="text-sm text-sw-text-secondary">
            규칙 {rules.length}개
          </span>
        </div>

        {grouped.size === 0 ? (
          <p className="rounded-lg border border-dashed border-sw-border-default bg-sw-bg-surface px-4 py-6 text-sm text-sw-text-secondary">
            규칙이 없습니다
          </p>
        ) : (
          <div className="space-y-6">
            {Array.from(grouped.entries()).map(([category, catRules]) => (
              <div key={category}>
                <h3 className="mb-2 text-sm font-semibold text-sw-text-secondary">
                  {category}
                </h3>
                <ul className="space-y-2">
                  {catRules.map((r, i) => (
                    <li
                      key={i}
                      className="rounded-md border border-sw-border-default bg-sw-bg-surface px-4 py-3 text-sm text-sw-text-primary"
                    >
                      {r.rule}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
