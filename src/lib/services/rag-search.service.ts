import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { QueryClassification, RAGMode } from "@/types";
import { classifyQuery, selectModes } from "./query-router";
import { SearchService } from "./search.service";
import { GraphRAGService } from "./graph-rag.service";
import { embedText } from "./embedding.service";
import { createLLMUsageLogger } from "./llm-usage-logger.service";
import { extractContentKeywords, extractKeywordSnippet } from "./qa-keywords";

export interface RAGResultItem {
  id: string;
  source: "graph" | "vector" | "bm25";
  type: "entity" | "chunk" | "chapter";
  title: string;
  content: string;
  score: number;
  metadata?: {
    entityType?: string;
    chapterNum?: number;
    chunkType?: string;
    relationPath?: string;
  };
}

export interface RAGSearchResult {
  query: string;
  classification: QueryClassification;
  modesUsed: RAGMode[];
  items: RAGResultItem[];
  latencyMs: number;
}

export class RAGSearchService {
  private searchService: SearchService;
  private graphService: GraphRAGService;

  constructor(private supabase: SupabaseClient<Database>) {
    this.searchService = new SearchService(supabase);
    this.graphService = new GraphRAGService(supabase);
  }

  async search(projectId: string, query: string): Promise<RAGSearchResult> {
    const start = performance.now();
    const classification = classifyQuery(query);
    const modes = selectModes(classification);

    // Execute modes in parallel
    const modeResults = await Promise.allSettled(
      modes.map((mode) => this.executeMode(mode, projectId, query))
    );

    // Collect all items from fulfilled modes
    let allItems: RAGResultItem[] = [];
    const usedModes: RAGMode[] = [];

    for (let i = 0; i < modes.length; i++) {
      const result = modeResults[i];
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
        usedModes.push(modes[i]);
      }
    }

    // Deduplicate by id
    const seen = new Set<string>();
    allItems = allItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // Sort by score desc, take top 30
    allItems.sort((a, b) => b.score - a.score);
    const top30 = allItems.slice(0, 30);

    // Lightweight reranking
    const reranked = this.rerank(top30, query);
    const top8 = reranked.slice(0, 8);

    const latencyMs = Math.round(performance.now() - start);

    // Log to rag_logs (fire and forget)
    this.supabase
      .from("rag_logs")
      .insert({
        project_id: projectId,
        query_original: query,
        mode_classification: classification.mode,
        search_results_top_n: top30 as unknown as Database["public"]["Tables"]["rag_logs"]["Insert"]["search_results_top_n"],
        reranked_top_8: top8 as unknown as Database["public"]["Tables"]["rag_logs"]["Insert"]["reranked_top_8"],
        latency_ms: latencyMs,
        cited_entities: top8
          .filter((i) => i.type === "entity")
          .map((i) => i.id),
      })
      // Fire-and-forget on purpose — a logging failure must not fail the search.
      // But it must not be invisible either: swallowing the error hid RLS/schema
      // breakage that silently emptied rag_logs.
      .then(({ error }) => {
        if (error) {
          console.error("[RAGSearch] rag_logs insert error:", error.message);
        }
      });

    return {
      query,
      classification,
      modesUsed: usedModes,
      items: top8,
      latencyMs,
    };
  }

  private async executeMode(
    mode: RAGMode,
    projectId: string,
    query: string
  ): Promise<RAGResultItem[]> {
    switch (mode) {
      case "graph":
        return this.executeGraph(projectId, query);
      case "vector":
        return this.executeVector(projectId, query);
      case "bm25":
        return this.executeBm25(projectId, query);
      default:
        return [];
    }
  }

  private async executeGraph(
    projectId: string,
    query: string
  ): Promise<RAGResultItem[]> {
    // Seed: try full query first, then fall back to individual terms
    let seeds = await this.searchService.searchEntitiesBm25(
      projectId,
      query,
      5
    );
    if (seeds.length === 0) {
      // Split query into terms, strip Korean particles, and try each
      const particles = /[은는이가을를의와과에서로으로도만까지부터라고]\s*$/;
      const terms = query
        .split(/\s+/)
        .map((t) => t.replace(particles, ""))
        .filter((t) => t.length >= 2);
      for (const term of terms) {
        seeds = await this.searchService.searchEntitiesBm25(
          projectId,
          term,
          5
        );
        if (seeds.length > 0) break;
      }
    }
    if (seeds.length === 0) return [];

    // Expand graph from top seed
    const related = await this.graphService.findRelatedEntities(
      seeds[0].id as string,
      2
    );

    return related.map((r, i) => ({
      id: r.entity_id,
      source: "graph" as const,
      type: "entity" as const,
      title: r.entity_name ?? "",
      content: r.relation_type ?? "",
      score: 1 - i * 0.05,
      metadata: {
        entityType: r.entity_type,
        relationPath: r.path?.join(" → "),
      },
    }));
  }

  private async executeVector(
    projectId: string,
    query: string
  ): Promise<RAGResultItem[]> {
    const queryEmbedding = await embedText(query, {
      onComplete: createLLMUsageLogger(this.supabase, {
        projectId,
        feature: "embedding",
        promptTemplateKey: "rag.query_embedding",
        promptTemplateVersion: "v1",
      }),
    });
    const chunks = await this.searchService.matchChunks(queryEmbedding, {
      projectId,
      matchCount: 15,
      matchThreshold: 0.3,
    });

    return chunks.map((c) => ({
      id: c.id,
      source: "vector" as const,
      type: "chunk" as const,
      title: `Chunk #${c.position ?? 0}`,
      content: c.content ?? "",
      score: c.similarity ?? 0,
      metadata: {
        chunkType: c.type,
      },
    }));
  }

  private async executeBm25(
    projectId: string,
    query: string
  ): Promise<RAGResultItem[]> {
    const [entities, chapters] = await Promise.all([
      this.searchService.searchEntitiesBm25(projectId, query, 10),
      this.searchService.searchChaptersBm25(projectId, query, 10),
    ]);

    const entityItems: RAGResultItem[] = entities.map((e) => ({
      id: e.id,
      source: "bm25" as const,
      type: "entity" as const,
      title: e.name ?? "",
      content: e.description ?? "",
      score: e.rank ?? 0,
      metadata: {
        entityType: e.type,
      },
    }));

    // Window the evidence around the query match — the head of a chapter
    // rarely contains the passage that made it rank.
    const snippetKeywords = [query, ...extractContentKeywords(query)];
    const chapterItems: RAGResultItem[] = chapters.map((c) => ({
      id: c.id,
      source: "bm25" as const,
      type: "chapter" as const,
      title: c.title ?? `Chapter ${c.chapter_num}`,
      content: extractKeywordSnippet(c.content ?? "", snippetKeywords, 400),
      score: c.rank ?? 0,
      metadata: {
        chapterNum: c.chapter_num,
      },
    }));

    return [...entityItems, ...chapterItems];
  }

  private rerank(items: RAGResultItem[], query: string): RAGResultItem[] {
    return items
      .map((item) => {
        let boost = 0;

        // Exact match boost
        if (
          item.title.includes(query) ||
          item.content.includes(query)
        ) {
          boost += 0.3;
        }

        // Multi-source boost: items found by multiple modes get priority
        // (already deduplicated, so this checks if content matches query terms)
        const queryTerms = query.split(/\s+/).filter((t) => t.length >= 2);
        const matchedTerms = queryTerms.filter(
          (t) => item.title.includes(t) || item.content.includes(t)
        );
        boost += matchedTerms.length * 0.1;

        return { ...item, score: item.score + boost };
      })
      .sort((a, b) => b.score - a.score);
  }
}
