import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { GenreRule } from "@/types";
import type { AssembledContext } from "./prompt-templates";
import { RAGSearchService } from "./rag-search.service";
import { ConsistencyService } from "./consistency.service";

export class ContextAssemblyService {
  constructor(private supabase: SupabaseClient<Database>) {}

  async assemble(
    projectId: string,
    chapterId: string,
    content: string
  ): Promise<AssembledContext> {
    const [genreRules, ragContext, recentChapters, conflicts] =
      await Promise.all([
        this.loadGenreRules(projectId),
        this.loadRAGContext(projectId, content),
        this.loadRecentChapters(projectId, chapterId),
        this.loadConflicts(chapterId),
      ]);

    return {
      genreRules,
      ragContext,
      recentChapters,
      currentChapter: content,
      conflicts,
    };
  }

  private async loadGenreRules(projectId: string): Promise<string> {
    const { data: project } = await this.supabase
      .from("projects")
      .select("genre")
      .eq("id", projectId)
      .single();

    if (!project?.genre) return "";

    // A genre_type may now match both a global kit and the user's custom kit.
    // Prefer the user's own kit (user_id NOT NULL sorts first), then fall back
    // to the global library kit. Do not use .single() — multiple rows are valid.
    const { data: kits } = await this.supabase
      .from("genre_kits")
      .select("name, rules, user_id")
      .eq("genre_type", project.genre)
      .order("user_id", { ascending: false, nullsFirst: false })
      .limit(1);

    const kit = kits?.[0];
    if (!kit?.rules) return "";

    const rules = kit.rules as unknown as GenreRule[];
    return `[${kit.name}]\n${rules.map((r) => `- (${r.category}) ${r.rule}`).join("\n")}`;
  }

  private async loadRAGContext(
    projectId: string,
    content: string
  ): Promise<string> {
    try {
      const rag = new RAGSearchService(this.supabase);
      const result = await rag.search(projectId, content.slice(0, 200));
      if (result.items.length === 0) return "";

      return result.items
        .map(
          (item, i) =>
            `${i + 1}. [${item.source}/${item.type}] ${item.title}: ${item.content.slice(0, 300)}`
        )
        .join("\n");
    } catch {
      return "";
    }
  }

  private async loadRecentChapters(
    projectId: string,
    currentChapterId: string
  ): Promise<string> {
    const { data: current } = await this.supabase
      .from("chapters")
      .select("chapter_num")
      .eq("id", currentChapterId)
      .single();

    if (!current) return "";

    const { data: chapters } = await this.supabase
      .from("chapters")
      .select("chapter_num, title, content")
      .eq("project_id", projectId)
      .lt("chapter_num", current.chapter_num)
      .order("chapter_num", { ascending: false })
      .limit(3);

    if (!chapters || chapters.length === 0) return "";

    return chapters
      .reverse()
      .map((ch) => {
        const summary = (ch.content ?? "").slice(0, 500);
        const title = ch.title ?? `Chapter ${ch.chapter_num}`;
        return `### Ch.${ch.chapter_num} — ${title}\n${summary}${(ch.content?.length ?? 0) > 500 ? "..." : ""}`;
      })
      .join("\n\n");
  }

  private async loadConflicts(chapterId: string) {
    try {
      const service = new ConsistencyService(this.supabase);
      return await service.detectConflicts(chapterId);
    } catch {
      return [];
    }
  }
}
