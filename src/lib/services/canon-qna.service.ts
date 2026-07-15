import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { callLLM } from "./llm.service";
import { getLLMModel } from "./llm-models";
import { getPromptTemplateVersion } from "./prompt-versions";
import { createLLMUsageLogger } from "./llm-usage-logger.service";
import { RAGSearchService, type RAGResultItem } from "./rag-search.service";
import { SearchService } from "./search.service";
import { extractContentKeywords, extractKeywordSnippet } from "./qa-keywords";
import { listApprovedCodexFactsByEntity } from "./canon-facts/read.service";
import { extractJsonObjectSlice } from "./llm-json";
import { buildCanonQAPrompt } from "./prompt-templates/canon-qa";

export interface CanonQACitation {
  index: number;
  id: string;
  source: RAGResultItem["source"];
  type: RAGResultItem["type"];
  title: string;
  label: string;
  content: string;
  score: number;
}

export interface CanonQAResult {
  question: string;
  answer: string | null;
  status: "answered" | "partial" | "insufficient_evidence";
  citations: CanonQACitation[];
  latencyMs: number;
}

type RawCanonQAResponse = {
  status?: unknown;
  answer?: unknown;
  citation_indexes?: unknown;
};

type EntityRow = Pick<
  Database["public"]["Tables"]["entities"]["Row"],
  "id" | "name" | "type" | "summary" | "aliases"
>;

const INSUFFICIENT_ANSWER =
  "현재 승인된 작품 기억과 원문 근거만으로는 확인할 수 없습니다.";

function clipContent(content: string, maxLength = 900): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function buildEvidenceBlock(items: RAGResultItem[]): string {
  return items
    .map((item, index) => {
      const label =
        item.type === "entity"
          ? "승인된 Codex"
          : item.type === "chunk"
            ? "원문 근거"
            : "챕터 근거";
      return [
        `[${index + 1}] ${label}`,
        `제목: ${item.title}`,
        `출처 유형: ${item.source}`,
        `내용: ${clipContent(item.content)}`,
      ].join("\n");
    })
    .join("\n\n");
}

function buildCitationLabel(item: RAGResultItem): string {
  if (item.type === "entity") return "승인된 Codex";
  if (item.metadata?.chapterNum) return `${item.metadata.chapterNum}화 원문`;
  if (item.type === "chapter") return "챕터 근거";
  return "원문 근거";
}

function formatApprovedFactEvidence(
  facts: Awaited<ReturnType<typeof listApprovedCodexFactsByEntity>>[string] | undefined
): string[] {
  if (!facts || facts.length === 0) return [];

  const lines = facts.slice(0, 8).map((fact) => {
    const source = fact.sources[0];
    const sourceLabel = source?.chapterNum
      ? `${source.chapterNum}화${source.chapterTitle ? ` 「${source.chapterTitle}」` : ""}`
      : fact.establishedChapterNum
        ? `${fact.establishedChapterNum}화`
        : "출처 회차 미상";
    const evidence = source?.evidenceText ? ` / 근거: ${clipContent(source.evidenceText, 180)}` : "";
    const key = fact.factKey ? `:${fact.factKey}` : "";
    return `- ${fact.factType}${key}: ${fact.value} (${sourceLabel}${evidence})`;
  });

  if (facts.length > lines.length) {
    lines.push(`- 승인된 세부 설정 ${facts.length - lines.length}개 더 있음`);
  }

  return ["승인된 세부 설정:", ...lines];
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function getAliases(entity: EntityRow): string[] {
  return Array.isArray(entity.aliases)
    ? entity.aliases.filter((alias): alias is string => typeof alias === "string")
    : [];
}

function findMentionedEntity(question: string, entities: EntityRow[]): EntityRow | null {
  const normalizedQuestion = normalizeText(question);
  const candidates = entities
    .flatMap((entity) => [
      { entity, term: entity.name },
      ...getAliases(entity).map((term) => ({ entity, term })),
    ])
    .filter((candidate) => candidate.term.trim().length >= 2)
    .filter((candidate) => normalizedQuestion.includes(normalizeText(candidate.term)))
    .sort((a, b) => b.term.length - a.term.length);

  return candidates[0]?.entity ?? null;
}

export function parseCanonQAResponse(raw: string, maxIndex: number): {
  status: CanonQAResult["status"];
  answer: string | null;
  citationIndexes: number[];
} {
  const jsonSlice = extractJsonObjectSlice(raw);
  let parsed: RawCanonQAResponse;

  try {
    if (!jsonSlice) throw new Error("no JSON object found in response");
    parsed = JSON.parse(jsonSlice) as RawCanonQAResponse;
  } catch {
    return {
      status: "insufficient_evidence",
      answer: null,
      citationIndexes: [],
    };
  }

  const status =
    parsed.status === "answered" || parsed.status === "partial"
      ? parsed.status
      : "insufficient_evidence";
  const answer =
    typeof parsed.answer === "string" && parsed.answer.trim()
      ? parsed.answer.trim()
      : null;
  const citationIndexes = Array.isArray(parsed.citation_indexes)
    ? parsed.citation_indexes
        .map((value) =>
          typeof value === "number" && Number.isInteger(value) ? value : null
        )
        .filter((value): value is number => value !== null)
        .filter((value) => value >= 1 && value <= maxIndex)
        .filter((value, index, values) => values.indexOf(value) === index)
        .slice(0, 3)
    : [];

  if (status === "insufficient_evidence" || !answer || citationIndexes.length === 0) {
    return {
      status: "insufficient_evidence",
      answer: null,
      citationIndexes: [],
    };
  }

  return { status, answer, citationIndexes };
}

export function sanitizeCanonQAAnswer(answer: string): string {
  return answer
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\[(\d+)\]/g, "")
    .replace(/^확인된 설정:/gm, "이번 근거로 확인됨:")
    .replace(/^확인 불가:/gm, "이번 근거로는 답하기 어려움:")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class CanonQAService {
  private ragSearch: RAGSearchService;
  private searchService: SearchService;

  constructor(private supabase: SupabaseClient<Database>) {
    this.ragSearch = new RAGSearchService(supabase);
    this.searchService = new SearchService(supabase);
  }

  /**
   * Event/why questions ("좌천된 이유는?") often carry no entity name, and the
   * full sentence matches poorly as a trigram query — so we additionally
   * retrieve chapters by extracted content keywords and window the snippet
   * around the match. This is what lets non-entity questions reach the
   * passage that actually answers them.
   */
  private async buildKeywordChapterEvidence(
    projectId: string,
    keywords: string[]
  ): Promise<RAGResultItem[]> {
    if (keywords.length === 0) return [];

    try {
      const chapters = await this.searchService.searchChaptersBm25(
        projectId,
        keywords.join(" "),
        4
      );
      return chapters.map((chapter) => ({
        id: chapter.id,
        source: "bm25" as const,
        type: "chapter" as const,
        title: chapter.title ?? `Chapter ${chapter.chapter_num}`,
        content: extractKeywordSnippet(chapter.content ?? "", keywords, 400),
        score: chapter.rank ?? 0,
        metadata: { chapterNum: chapter.chapter_num },
      }));
    } catch (error) {
      console.error(
        "[CanonQA] keyword chapter evidence failed:",
        error instanceof Error ? error.message : error
      );
      return [];
    }
  }

  private async buildEntityContextEvidence(
    projectId: string,
    question: string
  ): Promise<RAGResultItem[]> {
    const { data: entities, error: entityError } = await this.supabase
      .from("entities")
      .select("id, name, type, summary, aliases")
      .eq("project_id", projectId);

    if (entityError || !entities || entities.length === 0) return [];

    const entity = findMentionedEntity(question, entities as EntityRow[]);
    if (!entity) return [];

    const [mentionResult, factsByEntity] = await Promise.all([
      this.supabase
        .from("mentions")
        .select(
          "chunk_id, count, chunks!inner(id, content, position, chapter_id, chapters!inner(id, title, chapter_num, project_id))"
        )
        .eq("entity_id", entity.id),
      listApprovedCodexFactsByEntity(this.supabase, projectId, [entity.id]),
    ]);

    const { data: mentions, error: mentionError } = mentionResult;
    if (mentionError) return [];

    const rows = (mentions ?? [])
      .map((row) => {
        const chunk = row.chunks as unknown as {
          id: string;
          content: string;
          position: number | null;
          chapter_id: string;
          chapters: {
            id: string;
            title: string | null;
            chapter_num: number;
            project_id: string;
          };
        };
        return { row, chunk, chapter: chunk.chapters };
      })
      .filter(({ chapter }) => chapter.project_id === projectId)
      .sort((a, b) => {
        const chapterDiff = a.chapter.chapter_num - b.chapter.chapter_num;
        if (chapterDiff !== 0) return chapterDiff;
        return (a.chunk.position ?? 0) - (b.chunk.position ?? 0);
      });

    const first = rows[0];
    const chapterMap = new Map<string, { chapterNum: number; title: string | null; count: number }>();
    for (const { row, chapter } of rows) {
      const existing = chapterMap.get(chapter.id);
      const count = row.count ?? 1;
      if (existing) {
        existing.count += count;
      } else {
        chapterMap.set(chapter.id, {
          chapterNum: chapter.chapter_num,
          title: chapter.title,
          count,
        });
      }
    }

    const chapterSummaries = Array.from(chapterMap.values())
      .sort((a, b) => a.chapterNum - b.chapterNum)
      .slice(0, 6)
      .map((chapter) => {
        const title = chapter.title ? `「${chapter.title}」` : "";
        return `${chapter.chapterNum}화${title} ${chapter.count}회`;
      });

    const aliases = getAliases(entity);
    const content = [
      `[엔티티 컨텍스트]`,
      `이름: ${entity.name}`,
      `타입: ${entity.type}`,
      aliases.length > 0 ? `별칭/호칭: ${aliases.join(", ")}` : null,
      entity.summary ? `승인된 요약: ${entity.summary}` : null,
      ...formatApprovedFactEvidence(factsByEntity[entity.id]),
      first
        ? `첫 확인된 언급: ${first.chapter.chapter_num}화${
            first.chapter.title ? ` 「${first.chapter.title}」` : ""
          }`
        : null,
      chapterSummaries.length > 0
        ? `저장된 언급 챕터: ${chapterSummaries.join(", ")}`
        : null,
      first ? `첫 언급 근거: ${clipContent(first.chunk.content, 420)}` : null,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");

    if (!content.trim()) return [];

    return [
      {
        id: `entity-context:${entity.id}`,
        source: "graph",
        type: "entity",
        title: `${entity.name} 작품 기억 컨텍스트`,
        content,
        score: 1,
        metadata: first
          ? { entityType: entity.type, chapterNum: first.chapter.chapter_num }
          : { entityType: entity.type },
      },
    ];
  }

  async ask(params: {
    projectId: string;
    question: string;
    userId?: string | null;
  }): Promise<CanonQAResult> {
    const question = params.question.trim();
    const startedAt = performance.now();

    if (!question) {
      return {
        question,
        answer: null,
        status: "insufficient_evidence",
        citations: [],
        latencyMs: 0,
      };
    }

    const keywords = extractContentKeywords(question);
    const [entityContextItems, searchResult, keywordChapterItems] =
      await Promise.all([
        this.buildEntityContextEvidence(params.projectId, question),
        this.ragSearch.search(params.projectId, question),
        this.buildKeywordChapterEvidence(params.projectId, keywords),
      ]);

    // Priority: entity identity context, then keyword-targeted chapter
    // passages, then generic RAG items. Dedup by (type,id) and by normalized
    // content so the same passage never occupies two evidence slots.
    const seenIds = new Set<string>();
    const seenContent = new Set<string>();
    const evidenceItems = [
      ...entityContextItems,
      ...keywordChapterItems,
      ...searchResult.items,
    ]
      .filter((item) => {
        if (item.content.trim().length === 0) return false;
        const idKey = `${item.type}:${item.id}`;
        const contentKey = item.content.replace(/\s+/g, "").slice(0, 200);
        if (seenIds.has(idKey) || seenContent.has(contentKey)) return false;
        seenIds.add(idKey);
        seenContent.add(contentKey);
        return true;
      })
      .slice(0, 6);

    if (evidenceItems.length === 0) {
      return {
        question,
        answer: INSUFFICIENT_ANSWER,
        status: "insufficient_evidence",
        citations: [],
        latencyMs: Math.round(performance.now() - startedAt),
      };
    }

    const raw = await callLLM({
      ...buildCanonQAPrompt(question, buildEvidenceBlock(evidenceItems)),
      maxTokens: 700,
      model: getLLMModel("canonQnA"),
      temperature: 0,
      onComplete: createLLMUsageLogger(this.supabase, {
        projectId: params.projectId,
        userId: params.userId,
        feature: "search_rag",
        promptTemplateKey: "canon_qna",
        promptTemplateVersion: getPromptTemplateVersion("canon_qna"),
      }),
    });

    const parsed = parseCanonQAResponse(raw, evidenceItems.length);
    const citations = parsed.citationIndexes.map((index) => {
      const item = evidenceItems[index - 1];
      return {
        index,
        id: item.id,
        source: item.source,
        type: item.type,
        title: item.title,
        label: buildCitationLabel(item),
        content: clipContent(item.content, 260),
        score: item.score,
      };
    });

    return {
      question,
      answer:
        parsed.status === "answered" || parsed.status === "partial"
          ? sanitizeCanonQAAnswer(parsed.answer ?? "")
          : INSUFFICIENT_ANSWER,
      status: parsed.status,
      citations,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}
