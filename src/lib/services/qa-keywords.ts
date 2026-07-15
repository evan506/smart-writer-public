// Keyword extraction + snippet windowing for question-driven retrieval.
// Natural-language questions ("리엔이 좌천된 이유는 무엇인가요?") match poorly as
// whole strings against trigram BM25, and chapter rows are far longer than an
// evidence slot — so we (1) strip josa/question words down to content
// keywords and (2) cut the evidence window around the first keyword hit
// instead of the head of the chapter.

const QUESTION_STOPWORDS = new Set([
  "무엇",
  "무엇인가요",
  "무엇인가",
  "뭐",
  "뭔가요",
  "뭐야",
  "뭐지",
  "왜",
  "어떻게",
  "어떤",
  "누구",
  "누가",
  "누구인가요",
  "언제",
  "어디",
  "어디서",
  "이유",
  "이유는",
  "대해",
  "대한",
  "관해",
  "설명해",
  "알려줘",
  "알려주세요",
  "것",
  "건",
  "게",
  "인가요",
  "인가",
  "일까요",
  "일까",
]);

const JOSA_SUFFIX =
  /(은|는|이|가|을|를|의|와|과|랑|도|만|께|한테|에게|에서|에선|에|으로|로|보다|부터|까지|처럼|같이|인가요|인가|일까요|일까|했나요|했나|였나요|이었나요|되었나요|됐나요)$/u;

/**
 * Content keywords from a Korean question: punctuation removed, common
 * particles stripped once from each token, question/stop words dropped.
 * Longest-first so snippet windows anchor on the most specific term.
 */
export function extractContentKeywords(question: string): string[] {
  const tokens = question
    // Unicode punctuation/symbols (covers full-width ？！。 etc.), not just ASCII.
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(JOSA_SUFFIX, ""))
    .filter((token) => token.length >= 2)
    .filter((token) => !QUESTION_STOPWORDS.has(token));

  // Inflection tolerance for exact snippet matching: "좌천된" in the question
  // must still find "좌천되었다" in prose, so emit a last-syllable-dropped
  // stem variant alongside each token (≥ 3 chars keeps stems meaningful).
  const withStems = tokens.flatMap((token) =>
    token.length >= 3 ? [token, token.slice(0, -1)] : [token]
  );

  return Array.from(new Set(withStems))
    .filter((token) => !QUESTION_STOPWORDS.has(token))
    .sort((a, b) => b.length - a.length);
}

const MAX_OCCURRENCES_PER_KEYWORD = 5;

/**
 * Cuts the window where the MOST query keywords co-occur, not the first hit
 * of any keyword: character names ("리엔") match everywhere, so first-hit
 * anchoring pins the window to the chapter head while the passage that
 * answers the question ("좌천당했다") sits mid-chapter. Scoring candidate
 * windows by distinct-keyword co-occurrence finds the answering passage.
 * Falls back to the head of the content when nothing matches.
 */
export function extractKeywordSnippet(
  content: string,
  keywords: string[],
  windowSize = 400
): string {
  const normalized = content.trim();
  if (normalized.length <= windowSize) return normalized;

  const half = Math.floor(windowSize / 2);
  let best: { score: number; anchorLength: number; index: number } | null =
    null;

  for (const keyword of keywords) {
    if (!keyword) continue;
    let from = 0;
    for (let n = 0; n < MAX_OCCURRENCES_PER_KEYWORD; n += 1) {
      const index = normalized.indexOf(keyword, from);
      if (index === -1) break;
      from = index + keyword.length;

      const start = Math.max(0, index - half);
      const windowText = normalized.slice(start, start + windowSize);
      let score = 0;
      for (const other of keywords) {
        if (other && windowText.includes(other)) score += 1;
      }

      if (
        !best ||
        score > best.score ||
        (score === best.score && keyword.length > best.anchorLength)
      ) {
        best = { score, anchorLength: keyword.length, index };
      }
    }
  }

  if (best === null) {
    return `${normalized.slice(0, windowSize).trim()}...`;
  }

  const start = Math.max(0, best.index - half);
  const end = Math.min(normalized.length, start + windowSize);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < normalized.length ? "..." : "";
  return `${prefix}${normalized.slice(start, end).trim()}${suffix}`;
}
