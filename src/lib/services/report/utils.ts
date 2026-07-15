import type { ReportChunkSource } from "./types";

export function buildSnippet(chunk: ReportChunkSource): string {
  const source = chunk.summary || chunk.content;
  return normalizeWhitespace(source).slice(0, 280);
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function countBy<T>(
  rows: T[],
  getKey: (row: T) => string | null | undefined
): Record<string, number> {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = getKey(row) ?? "UNKNOWN";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
}
