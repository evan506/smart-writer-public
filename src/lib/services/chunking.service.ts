import type { ChunkType } from "@/types";

export interface RawChunk {
  type: ChunkType;
  content: string;
  position: number;
}

const SCENE_BREAK_RE = /^(?:\*{3,}|-{3,}|={3,}|#{3,})$/m;
const DIALOGUE_RE = /[「」""]/;
const CHARS_PER_TOKEN = 1 / 0.6; // ~1.67 chars per token
const MIN_TOKENS = 256;
const MAX_TOKENS = 512;
const MIN_CHARS = Math.floor(MIN_TOKENS * CHARS_PER_TOKEN);
const MAX_CHARS = Math.floor(MAX_TOKENS * CHARS_PER_TOKEN);
const CHAPTER_SUMMARY_CHARS = Math.floor(512 * CHARS_PER_TOKEN);

function isDialogue(text: string): boolean {
  return DIALOGUE_RE.test(text);
}

function splitIntoScenes(content: string): string[] {
  return content
    .split(SCENE_BREAK_RE)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function mergeSmallSegments(segments: string[], maxChars: number): string[] {
  const merged: string[] = [];
  let buffer = "";

  for (const seg of segments) {
    if (buffer && buffer.length + seg.length + 1 > maxChars) {
      merged.push(buffer);
      buffer = seg;
    } else {
      buffer = buffer ? buffer + "\n\n" + seg : seg;
    }
  }
  if (buffer) merged.push(buffer);
  return merged;
}

/**
 * 최소 크기에 못 미치는 세그먼트를 이웃에 흡수시킨다. 이전 세그먼트를 우선하고,
 * 없으면 다음 세그먼트로 접는다. 어디에도 못 붙으면 단독 청크로 남긴다.
 *
 * 예전에는 이런 세그먼트를 그냥 버렸는데, 그러면 그 텍스트가 `chunks`에서 사라져
 * 벡터 검색·멘션 추출·엔티티 추출이 전부 그 구간을 보지 못했다(원고에는 멀쩡히
 * 보이는데도). 내용은 절대 버리지 않는다.
 */
function absorbUndersized(
  segments: string[],
  minChars: number,
  maxChars: number
): string[] {
  const out: string[] = [];

  for (const seg of segments) {
    const prev = out[out.length - 1];
    const fitsInPrev = prev && prev.length + seg.length + 2 <= maxChars;
    if (seg.length < minChars && fitsInPrev) {
      out[out.length - 1] = `${prev}\n\n${seg}`;
      continue;
    }
    out.push(seg);
  }

  // 맨 앞 세그먼트는 이전 이웃이 없으므로 뒤로 접는다.
  const canFoldForward =
    out.length >= 2 &&
    out[0].length < minChars &&
    out[0].length + out[1].length + 2 <= maxChars;
  if (canFoldForward) {
    out[1] = `${out[0]}\n\n${out[1]}`;
    out.shift();
  }

  return out;
}

function classifyChunkType(text: string): ChunkType {
  const lines = text.split("\n").filter(Boolean);
  const dialogueLines = lines.filter((l) => isDialogue(l)).length;
  return dialogueLines / lines.length > 0.5 ? "DIALOGUE" : "SCENE";
}

export function chunkChapter(content: string): RawChunk[] {
  if (!content || !content.trim()) return [];

  const chunks: RawChunk[] = [];
  let position = 0;

  // 1) CHAPTER chunk — first ~512 tokens as chapter-level context
  const chapterContent = content.slice(0, CHAPTER_SUMMARY_CHARS).trim();
  if (chapterContent) {
    chunks.push({ type: "CHAPTER", content: chapterContent, position });
    position++;
  }

  // 2) Scene-level splitting
  const segments: string[] = [];
  for (const scene of splitIntoScenes(content)) {
    if (scene.length <= MAX_CHARS) {
      segments.push(scene);
      continue;
    }
    // Large scene → split by paragraphs, then merge back up to target size
    segments.push(...mergeSmallSegments(splitByParagraphs(scene), MAX_CHARS));
  }

  for (const segment of absorbUndersized(segments, MIN_CHARS / 2, MAX_CHARS)) {
    // An undersized segment that survived absorption had no neighbour to merge into.
    // Emit it only if the CHAPTER chunk doesn't already carry the same text — for a
    // short chapter the two are byte-identical, and indexing both would embed the
    // same text twice and double its weight in vector search.
    const coveredByChapterChunk =
      segment.length < MIN_CHARS / 2 && chapterContent.includes(segment);
    if (coveredByChapterChunk) continue;

    chunks.push({
      type: classifyChunkType(segment),
      content: segment,
      position,
    });
    position++;
  }

  return chunks;
}
