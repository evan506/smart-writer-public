import type { EntitySuggestion, EntityType } from "@/types";

export interface AliasTarget {
  id: string;
  name: string;
  type: string;
  aliases: string[];
}

export interface EditForm {
  name: string;
  type: EntityType;
  summary: string;
  aliases: string;
}

export interface SuggestionHandlers {
  startEdit: (suggestion: EntitySuggestion) => void;
  handleConfirm: (
    suggestionId: string,
    overrides?: {
      name?: string;
      type?: EntityType;
      summary?: string;
      aliases?: string[];
    }
  ) => void;
  handleConfirmAsAlias: (suggestionId: string, targetEntityId: string) => void;
  handleRejectAliasTarget: (suggestionId: string) => void;
  handleDismiss: (suggestionId: string) => void;
  handleExclude: (suggestionId: string, suggestionName: string) => void;
}
