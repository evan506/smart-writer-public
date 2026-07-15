export interface InlineWarning {
  id: string;
  severity: "high" | "medium" | "low";
  type: string;
  entityName: string;
  detail: string;
  suggestion?: string;
  matchedText: string;
  source: "db" | "ai";
}
