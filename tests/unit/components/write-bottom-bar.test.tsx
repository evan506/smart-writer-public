import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WriteBottomBar } from "@/components/write/write-bottom-bar";

describe("WriteBottomBar", () => {
  it("shows a saved state when the loaded chapter is idle", () => {
    const html = renderToStaticMarkup(
      <WriteBottomBar
        content="저장된 본문"
        platformMode="default"
        onPlatformModeChange={vi.fn()}
        saveStatus="idle"
        onSave={vi.fn()}
      />
    );

    expect(html).toContain("저장됨");
  });

  it("keeps saving and error states explicit", () => {
    const savingHtml = renderToStaticMarkup(
      <WriteBottomBar
        content=""
        platformMode="default"
        onPlatformModeChange={vi.fn()}
        saveStatus="saving"
        onSave={vi.fn()}
      />
    );
    const errorHtml = renderToStaticMarkup(
      <WriteBottomBar
        content=""
        platformMode="default"
        onPlatformModeChange={vi.fn()}
        saveStatus="error"
        onSave={vi.fn()}
      />
    );

    expect(savingHtml).toContain("저장 중");
    expect(errorHtml).toContain("저장 실패");
  });
});
