export type ReviewableSuggestion = {
  id: string;
  name: string;
  suggested_action?: string | null;
};

export function isMergeSuggestion(suggestion: ReviewableSuggestion) {
  return suggestion.suggested_action === "MERGE";
}

export function getConfirmableSuggestions<T extends ReviewableSuggestion>(
  suggestions: T[]
) {
  return suggestions.filter((suggestion) => !isMergeSuggestion(suggestion));
}

export function getSkippedMergeCount(suggestions: ReviewableSuggestion[]) {
  return suggestions.length - getConfirmableSuggestions(suggestions).length;
}

export function getConfirmableSuggestionIdsByName(
  suggestions: ReviewableSuggestion[],
  name: string
) {
  return getConfirmableSuggestions(suggestions)
    .filter((suggestion) => suggestion.name === name)
    .map((suggestion) => suggestion.id);
}
