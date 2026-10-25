// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WriteBottomBar } from "@/components/write/write-bottom-bar";

describe("WriteBottomBar", () => {
  afterEach(cleanup);
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
  it.each([
    ["pending", "변경 있음 · 저장 대기"],
    ["saving", "저장 중"],
    ["saved", "저장됨"],
    ["offline", "오프라인 · 연결 후 저장해 주세요"],
    ["error", "저장 실패"],
  ] as const)("announces the %s state", (saveStatus, label) => {
    render(<WriteBottomBar content="본문" platformMode="default" onPlatformModeChange={vi.fn()}
      saveStatus={saveStatus} onSave={vi.fn()} chapterId="chapter-1" />);
    expect(screen.getByRole("status").textContent).toBe(label);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("offers an actionable retry after failure", () => {
    const onSave = vi.fn();
    render(<WriteBottomBar content="본문" platformMode="default" onPlatformModeChange={vi.fn()}
      saveStatus="error" onSave={onSave} chapterId="chapter-1" />);
    fireEvent.click(screen.getByRole("button", { name: "다시 저장" }));
    expect(onSave).toHaveBeenCalledOnce();
  });

  it.each([
    ["saving", "chapter-1"],
    ["offline", "chapter-1"],
    ["idle", null],
  ] as const)("disables manual save in %s with chapter %s", (saveStatus, chapterId) => {
    const onSave = vi.fn();
    render(<WriteBottomBar content="본문" platformMode="default" onPlatformModeChange={vi.fn()}
      saveStatus={saveStatus} onSave={onSave} chapterId={chapterId} />);
    const button = screen.getByRole("button", { name: "저장하고 기억 정리" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onSave).not.toHaveBeenCalled();
  });

  it.each([
    ["default", "공백 포함 10자"],
    ["novelpia", "노벨피아 참고 3자"],
    ["munpia", "문피아 참고 7자"],
  ] as const)("displays the selected %s counting rule", (platformMode, expected) => {
    render(<WriteBottomBar content={'가, 나!\n다…\t·'} platformMode={platformMode} onPlatformModeChange={vi.fn()}
      saveStatus="saved" onSave={vi.fn()} chapterId="chapter-1" />);
    const count = screen.getByRole("group", { name: "선택 기준 글자 수" });
    expect(count.textContent).toBe(expected);
    expect(screen.getByText(/공백제외/).textContent).toBe("공백제외 7자");
    if (platformMode !== "default") expect(count.title).toContain("플랫폼 공식 집계와 다를 수 있습니다");
  });

  it("updates the visible count when the selected platform changes", () => {
    const props = { content: "가, 나!", onPlatformModeChange: vi.fn(), saveStatus: "saved" as const, onSave: vi.fn(), chapterId: "chapter-1" };
    const { rerender } = render(<WriteBottomBar {...props} platformMode="default" />);
    expect(screen.getByRole("group", { name: "선택 기준 글자 수" }).textContent).toBe("공백 포함 5자");
    rerender(<WriteBottomBar {...props} platformMode="novelpia" />);
    expect(screen.getByRole("group", { name: "선택 기준 글자 수" }).textContent).toBe("노벨피아 참고 2자");
  });

});
