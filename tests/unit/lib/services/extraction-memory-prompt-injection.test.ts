import { describe, expect, it } from "vitest";
import {
  buildStage1NounExtractionPrompt,
  buildStage2ClassificationPrompt,
} from "@/lib/services/prompt-templates/entity-extraction-stages";

const GUIDANCE = "[추출 학습 메모리]\n- (제외) 회상 속 인물 중복 제외";

describe("stage prompt guidance injection", () => {
  it("omits the guidance section when no guidance is provided", () => {
    const withDefault = buildStage1NounExtractionPrompt("본문", ["리엔"]);
    const withEmpty = buildStage1NounExtractionPrompt("본문", ["리엔"], "");
    // Empty guidance must be byte-identical to the no-arg form.
    expect(withEmpty.system).toBe(withDefault.system);
    expect(withDefault.system).not.toContain("추출 학습 메모리");
  });

  it("injects guidance into the stage1 noun extraction prompt", () => {
    const { system } = buildStage1NounExtractionPrompt("본문", ["리엔"], GUIDANCE);
    expect(system).toContain("회상 속 인물 중복 제외");
    // Guidance precedes the closing JSON-only instruction.
    expect(system.indexOf("회상 속 인물")).toBeLessThan(
      system.indexOf("JSON 배열만 반환")
    );
  });

  it("injects guidance into the stage2 classification prompt", () => {
    const { system } = buildStage2ClassificationPrompt("후보", "기존", GUIDANCE);
    expect(system).toContain("회상 속 인물 중복 제외");
    expect(system.indexOf("회상 속 인물")).toBeLessThan(
      system.lastIndexOf("JSON 배열만 반환")
    );
  });

  it("keeps stage2 byte-identical when guidance is empty", () => {
    const withDefault = buildStage2ClassificationPrompt("후보", "기존");
    const withEmpty = buildStage2ClassificationPrompt("후보", "기존", "");
    expect(withEmpty.system).toBe(withDefault.system);
  });
});
