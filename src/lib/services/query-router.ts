import type { RAGMode, QueryClassification } from "@/types";

const GRAPH_KEYWORDS = [
  "관계",
  "연결",
  "세력",
  "소속",
  "동맹",
  "적대",
  "가족",
  "친구",
  "사제",
  "주종",
  "연관",
  "관련",
];

const VECTOR_KEYWORDS = [
  "장면",
  "분위기",
  "유사",
  "비슷한",
  "느낌",
  "톤",
  "묘사",
  "상황",
  "감정",
  "배경",
];

const BM25_INDICATORS = {
  maxLength: 8,
  patterns: [/^[가-힣]{2,6}$/, /^".*"$/],
};

function countMatches(query: string, keywords: string[]): number {
  return keywords.filter((kw) => query.includes(kw)).length;
}

export function classifyQuery(query: string): QueryClassification {
  const trimmed = query.trim();

  // 짧은 고유명사 → BM25
  const isBm25 = BM25_INDICATORS.patterns.some((p) => p.test(trimmed));
  if (isBm25 || trimmed.length <= BM25_INDICATORS.maxLength) {
    return {
      mode: "bm25",
      confidence: 0.8,
      reasoning: "짧은 고유명사 쿼리 — BM25 정확 매칭 우선",
    };
  }

  const graphScore = countMatches(trimmed, GRAPH_KEYWORDS);
  const vectorScore = countMatches(trimmed, VECTOR_KEYWORDS);

  // 혼합 신호
  if (graphScore > 0 && vectorScore > 0) {
    return {
      mode: "hybrid",
      confidence: 0.6,
      reasoning: `그래프(${graphScore})와 벡터(${vectorScore}) 키워드 동시 감지`,
    };
  }

  if (graphScore > 0) {
    return {
      mode: "graph",
      confidence: Math.min(0.5 + graphScore * 0.15, 0.95),
      reasoning: `관계/구조 키워드 ${graphScore}개 감지`,
    };
  }

  if (vectorScore > 0) {
    return {
      mode: "vector",
      confidence: Math.min(0.5 + vectorScore * 0.15, 0.95),
      reasoning: `의미/장면 키워드 ${vectorScore}개 감지`,
    };
  }

  // 기본: 긴 자연어 쿼리 → vector
  return {
    mode: "vector",
    confidence: 0.5,
    reasoning: "키워드 미감지 — 기본 벡터 검색",
  };
}

export function selectModes(classification: QueryClassification): RAGMode[] {
  switch (classification.mode) {
    case "hybrid":
      return ["graph", "vector", "bm25"];
    case "graph":
      return ["graph", "bm25"];
    case "vector":
      return ["vector", "bm25"];
    case "bm25":
      return ["bm25"];
  }
}
