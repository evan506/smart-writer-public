import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildAnalysisPrompt,
  buildStage1NounExtractionPrompt,
  buildStage2ClassificationPrompt,
  buildStage3RelationExtractionPrompt,
} from "@/lib/services/prompt-templates";
import { DISTILLATION_SYSTEM_PROMPT } from "@/lib/services/extraction-memory/distillation.service";
import { buildCanonQAPrompt } from "@/lib/services/prompt-templates/canon-qa";
import {
  PROMPT_TEMPLATE_VERSIONS,
  type PromptTemplateKey,
} from "@/lib/services/prompt-versions";

// Guard: llm_usage_logs.prompt_template_version must change when the rendered
// prompt changes, so logged usage stays segmentable by prompt revision.
// If a test here fails, you changed a template — bump the version in
// src/lib/services/prompt-versions.ts AND update the recorded hash below
// (the failure message prints the new hash).

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function renderCanonical(key: PromptTemplateKey): string | null {
  switch (key) {
    case "entity_extraction.stage1_nouns": {
      const p = buildStage1NounExtractionPrompt("리엔은 검은 서고로 갔다.", ["카엘"], "");
      return `${p.system}\n---\n${p.user}`;
    }
    case "entity_extraction.stage2_classify": {
      const p = buildStage2ClassificationPrompt("리엔: 검은 서고로 갔다.", "(없음)", "");
      return `${p.system}\n---\n${p.user}`;
    }
    case "entity_extraction.stage3_relations": {
      const p = buildStage3RelationExtractionPrompt(
        "- 리엔 (CHARACTER)\n- 검은 관리자 (ORGANIZATION)",
        '[리엔 & 검은 관리자]: "리엔은 검은 관리자를 경계했다."',
        []
      );
      return `${p.system}\n---\n${p.user}`;
    }
    case "analysis.chapter": {
      const p = buildAnalysisPrompt({
        genreRules: "판타지 규칙",
        ragContext: "기존 설정",
        recentChapters: "이전 요약",
        currentChapter: "현재 본문",
        conflicts: [],
      });
      return `${p.system}\n---\n${p.user}`;
    }
    case "extraction_memory.distillation":
      return DISTILLATION_SYSTEM_PROMPT;
    case "canon_qna": {
      const p = buildCanonQAPrompt("리엔은 누구인가요?", "[1] 승인된 Codex\n제목: 리엔");
      return `${p.system}\n---\n${p.user}`;
    }
  }
}

// Recorded (version, hash) pairs. Run the test to get the current hash when
// intentionally updating a template.
const RECORDED: Record<PromptTemplateKey, { version: string; hash: string | null }> = {
  "entity_extraction.stage1_nouns": { version: "v2", hash: "275c01501bb1f0af" },
  "entity_extraction.stage2_classify": { version: "v1", hash: "d91a8b2e9793f03a" },
  "entity_extraction.stage3_relations": { version: "v1", hash: "6b6326a463d39e76" },
  "analysis.chapter": { version: "v1", hash: "1acf7d1d882570ba" },
  canon_qna: { version: "v1", hash: "f497bcdd66705d8c" },
  "extraction_memory.distillation": { version: "v1", hash: "68ea402a5dbe7697" },
};

describe("prompt version guard", () => {
  const keys = Object.keys(PROMPT_TEMPLATE_VERSIONS) as PromptTemplateKey[];

  it.each(keys)("%s: rendered prompt matches its recorded version", (key) => {
    const recorded = RECORDED[key];
    expect(
      PROMPT_TEMPLATE_VERSIONS[key],
      `version registry drifted from the recorded pair for ${key}`
    ).toBe(recorded.version);

    const rendered = renderCanonical(key);
    if (rendered === null) return;

    const actual = sha256(rendered);
    expect(
      actual,
      `Prompt template "${key}" changed (hash ${actual}). ` +
        `Bump PROMPT_TEMPLATE_VERSIONS["${key}"] in src/lib/services/prompt-versions.ts ` +
        `and update RECORDED["${key}"] to { version: "<new>", hash: "${actual}" }.`
    ).toBe(recorded.hash);
  });
});
