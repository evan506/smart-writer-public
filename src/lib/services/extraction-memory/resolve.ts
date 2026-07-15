// Pure layered-memory resolution. No DB access here so this is fully
// unit-testable. Precedence: project > account > genre.

import type {
  AppliedMemorySummary,
  MemoryLayer,
  MemoryRule,
} from "./types";

export const DEFAULT_PROMPT_BLOCK_CHAR_CAP = 600;

const LAYER_PRECEDENCE: Record<MemoryLayer, number> = {
  project: 0,
  account: 1,
  genre: 2,
};

/**
 * Resolve the effective rule set across layers.
 *
 * - A genre-baseline rule whose key is in `disabledGenreKeys` is dropped
 *   (per-project override).
 * - When the same rule key exists in more than one layer, the
 *   higher-precedence layer wins (project over account over genre).
 *
 * Order within the result is stable: higher-precedence layers first, then
 * insertion order within a layer.
 */
export function resolveLayeredRules(
  layers: {
    project?: MemoryRule[];
    account?: MemoryRule[];
    genre?: MemoryRule[];
  },
  disabledGenreKeys: Set<string> = new Set()
): MemoryRule[] {
  const all: MemoryRule[] = [
    ...(layers.project ?? []),
    ...(layers.account ?? []),
    ...(layers.genre ?? []).filter((rule) => !disabledGenreKeys.has(rule.key)),
  ];

  const winnerByKey = new Map<string, MemoryRule>();
  for (const rule of all) {
    const existing = winnerByKey.get(rule.key);
    if (
      !existing ||
      LAYER_PRECEDENCE[rule.layer] < LAYER_PRECEDENCE[existing.layer]
    ) {
      winnerByKey.set(rule.key, rule);
    }
  }

  return Array.from(winnerByKey.values()).sort(
    (a, b) => LAYER_PRECEDENCE[a.layer] - LAYER_PRECEDENCE[b.layer]
  );
}

const EXCLUDE_HEADER = "[추출 학습 메모리]";
const EXCLUDE_INTRO =
  "이 작품에서 학습된 추출 규칙입니다. 후보를 만들 때 반영하세요.";

/**
 * Render the Korean prompt block injected into extraction calls, capped at
 * `charCap`. Rules are emitted in precedence order; exact-name exclusions are
 * appended last. Returns `truncated: true` if any rule or name was dropped to
 * fit the cap.
 */
export function renderPromptBlock(
  rules: MemoryRule[],
  excludeNames: string[],
  charCap: number = DEFAULT_PROMPT_BLOCK_CHAR_CAP
): { text: string; truncated: boolean } {
  if (rules.length === 0 && excludeNames.length === 0) {
    return { text: "", truncated: false };
  }

  const lines: string[] = [EXCLUDE_HEADER, EXCLUDE_INTRO];
  let truncated = false;

  for (const rule of rules) {
    const label = rule.kind === "EXCLUDE_PATTERN" ? "제외" : "분류";
    const candidate = `- (${label}) ${rule.text}`;
    if (joinedLength([...lines, candidate]) > charCap) {
      truncated = true;
      break;
    }
    lines.push(candidate);
  }

  if (excludeNames.length > 0) {
    const namesLine = `이미 제외하기로 한 이름: ${excludeNames.join(", ")}`;
    if (joinedLength([...lines, namesLine]) <= charCap) {
      lines.push(namesLine);
    } else {
      // Fit as many names as the cap allows.
      const fitted = fitNames(lines, excludeNames, charCap);
      if (fitted.line) lines.push(fitted.line);
      if (fitted.dropped) truncated = true;
    }
  }

  return { text: lines.join("\n"), truncated };
}

function fitNames(
  baseLines: string[],
  names: string[],
  charCap: number
): { line: string | null; dropped: boolean } {
  const prefix = "이미 제외하기로 한 이름: ";
  const kept: string[] = [];
  for (const name of names) {
    const trial = `${prefix}${[...kept, name].join(", ")}`;
    if (joinedLength([...baseLines, trial]) > charCap) {
      return {
        line: kept.length > 0 ? `${prefix}${kept.join(", ")}` : null,
        dropped: true,
      };
    }
    kept.push(name);
  }
  return {
    line: kept.length > 0 ? `${prefix}${kept.join(", ")}` : null,
    dropped: false,
  };
}

function joinedLength(lines: string[]): number {
  return lines.join("\n").length;
}

/**
 * Build the structured summary for the transparency surface from the SAME
 * resolved rules that were actually injected.
 */
export function summarizeAppliedMemory(
  rules: MemoryRule[],
  excludeNames: string[],
  truncated: boolean
): AppliedMemorySummary {
  const byLayer: Record<MemoryLayer, number> = {
    project: 0,
    account: 0,
    genre: 0,
  };
  for (const rule of rules) {
    byLayer[rule.layer] += 1;
  }
  return {
    totalRules: rules.length,
    byLayer,
    excludeNameCount: excludeNames.length,
    truncated,
  };
}
