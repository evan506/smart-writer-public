import { stripCodeFences, extractJsonArraySlice } from "../llm-json";

/**
 * Repairs common malformed JSON emitted by LLMs when Korean dialogue quotes
 * appear inside string fields that should have been escaped.
 */
export function repairJSONQuotes(text: string): string {
  let result = text.replace(
    /^(\s*"(?:context_snippet|summary)":\s*")(.*)(")(\s*,?\s*)$/gm,
    (
      _,
      prefix: string,
      value: string,
      closingQuote: string,
      trailing: string
    ) => {
      const fixed = value.replace(/"/g, "'");
      return prefix + fixed + closingQuote + trailing;
    }
  );
  result = result.replace(/,\s*([}\]])/g, "$1");
  return result;
}

function findFirstArrayValue(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const arrayValue = Object.values(parsed).find(Array.isArray);
    if (Array.isArray(arrayValue)) return arrayValue;
  }
  return null;
}

function parseArrayLikeJSON(raw: string): unknown[] | null {
  try {
    return findFirstArrayValue(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function extractJSONArray(raw: string): unknown[] | null {
  const cleaned = stripCodeFences(raw);

  const direct = parseArrayLikeJSON(cleaned);
  if (direct) return direct;

  const repaired = parseArrayLikeJSON(repairJSONQuotes(cleaned));
  if (repaired) return repaired;

  const jsonPart = extractJsonArraySlice(cleaned);
  if (!jsonPart) return null;

  return parseArrayLikeJSON(jsonPart) ?? parseArrayLikeJSON(repairJSONQuotes(jsonPart));
}
