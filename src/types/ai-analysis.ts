export interface AIConflict {
  type: string;
  severity: "high" | "medium" | "low";
  entity: string;
  detail: string;
  suggestion: string;
  matchedText?: string;
}

export interface AISuggestion {
  category: "plot" | "character" | "worldbuilding" | "style";
  content: string;
}

export interface AIReference {
  source: "entity" | "chapter" | "chunk";
  id: string;
  title: string;
  relevance: string;
}

export interface AIAnalysisResult {
  conflicts: AIConflict[];
  suggestions: AISuggestion[];
  references: AIReference[];
  rawResponse?: string;
}
