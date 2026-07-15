import type { ReportData } from "../report.service";

export function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "";

  const headerLine = `| ${headers.map(escapeCell).join(" | ")} |`;
  const dividerLine = `| ${headers.map(() => "---").join(" | ")} |`;
  const rowLines = rows.map(
    (row) => `| ${row.map((cell) => escapeCell(cell || "-")).join(" | ")} |`
  );

  return [headerLine, dividerLine, ...rowLines].join("\n");
}

export function operatorNote(include: boolean, notes: string[]): string[] {
  if (!include) return [];
  return ["운영 메모:", "", ...notes.map((note) => `- ${note}`), ""];
}

export function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

export function label(labels: Record<string, string>, value: string): string {
  return labels[value] ?? value;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Seoul",
  }).format(date);
}

export function formatRange(data: ReportData): string {
  if (data.range.chapterFrom != null || data.range.chapterTo != null) {
    const from = data.range.chapterFrom != null ? `${data.range.chapterFrom}화` : "첫 화";
    const to = data.range.chapterTo != null ? `${data.range.chapterTo}화` : "마지막 화";
    return `${from}-${to}`;
  }

  const first = data.chapters[0]?.chapter_num;
  const last = data.chapters.at(-1)?.chapter_num;
  if (first == null || last == null) return "회차 없음";
  return first === last ? `${first}화` : `${first}화-${last}화`;
}

export function formatCounts(
  counts: Record<string, number>,
  labels: Record<string, string>
): string {
  const entries = Object.entries(counts);
  if (entries.length === 0) return "없음";
  return entries.map(([key, count]) => `${label(labels, key)} ${count}`).join(", ");
}

export function groupBy<T>(
  rows: T[],
  getKey: (row: T) => string
): Record<string, T[]> {
  return rows.reduce<Record<string, T[]>>((acc, row) => {
    const key = getKey(row);
    acc[key] = acc[key] ?? [];
    acc[key].push(row);
    return acc;
  }, {});
}
