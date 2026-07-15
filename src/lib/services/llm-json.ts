/**
 * Common primitives for parsing JSON out of raw LLM text output.
 *
 * LLMs frequently wrap JSON in markdown code fences and/or surround it with
 * prose. These helpers isolate the "strip fences" / "slice to the JSON
 * boundaries" steps shared across the various response parsers so each
 * call site only has to own its own validation/tolerance semantics.
 */

/** Removes ```json / ``` code fences (case-insensitive) and trims. */
export function stripCodeFences(raw: string): string {
  return raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

/**
 * Fence-strips `raw`, then slices from the first "[" to the last "]".
 * Returns null when no valid bracket pair is found (missing or out of order).
 */
export function extractJsonArraySlice(raw: string): string | null {
  const cleaned = stripCodeFences(raw);
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

/**
 * Fence-strips `raw`, then slices from the first "{" to the last "}".
 * Returns null when no valid brace pair is found (missing or out of order).
 */
export function extractJsonObjectSlice(raw: string): string | null {
  const cleaned = stripCodeFences(raw);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}
