import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Globe, Lock, User } from "lucide-react";
import type { GenreKit, GenreRule } from "@/types";

export function GenreKitCard({
  kit,
  isOwner,
}: {
  kit: GenreKit;
  isOwner: boolean;
}) {
  const rules = (kit.rules as unknown as GenreRule[]) ?? [];
  const isGlobal = kit.user_id === null;

  return (
    <Link href={`/genre-kits/${kit.id}`}>
      <Card className="border-sw-border-default bg-sw-bg-surface text-sw-text-primary transition-colors hover:border-sw-border-hover hover:bg-sw-bg-elevated">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-lg text-sw-text-primary">{kit.name}</CardTitle>
            <Badge
              variant="secondary"
              className="bg-sw-accent-bg text-sw-accent"
            >
              {kit.genre_type}
            </Badge>
            {isGlobal ? (
              <Badge
                variant="outline"
                className="gap-1 border-sw-border-default text-sw-text-secondary"
              >
                <Globe className="size-3" />
                공용
              </Badge>
            ) : isOwner ? (
              <Badge
                variant="outline"
                className="gap-1 border-sw-border-default text-sw-text-secondary"
              >
                <User className="size-3" />
                내 장르 킷
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-sw-border-default text-sw-text-secondary"
              >
                <Globe className="size-3" />
                공개
              </Badge>
            )}
            {!isGlobal && isOwner && !kit.is_public && (
              <Badge
                variant="outline"
                className="gap-1 border-sw-border-default text-sw-text-secondary"
              >
                <Lock className="size-3" />
                비공개
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-sw-text-secondary">
            규칙 {rules.length}개
          </p>
          {rules.length > 0 ? (
            <ul className="space-y-1">
              {rules.slice(0, 2).map((r, i) => (
                <li key={i} className="line-clamp-1 text-sm text-sw-text-secondary">
                  <span className="font-medium text-sw-text-primary/80">[{r.category}]</span>{" "}
                  {r.rule}
                </li>
              ))}
              {rules.length > 2 && (
                <li className="text-xs text-sw-text-muted">
                  +{rules.length - 2}개 더...
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm italic text-sw-text-secondary">규칙 없음</p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
