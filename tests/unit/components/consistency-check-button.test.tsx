// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const checkConsistencyMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/(dashboard)/projects/[id]/chapters-actions", () => ({
  checkConsistency: checkConsistencyMock,
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ConsistencyCheckButton } from "@/components/write/consistency-check-button";
import { toast } from "sonner";

const CHAPTER_ID = "11111111-1111-4111-8111-111111111111";

describe("ConsistencyCheckButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("calls checkConsistency with the chapterId when clicked", async () => {
    checkConsistencyMock.mockResolvedValue({ error: null, conflicts: [] });
    const user = userEvent.setup();
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);

    await user.click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));

    await waitFor(() =>
      expect(checkConsistencyMock).toHaveBeenCalledWith(CHAPTER_ID)
    );
  });

  it("renders the empty-state message when there are no conflicts", async () => {
    checkConsistencyMock.mockResolvedValue({ error: null, conflicts: [] });
    const user = userEvent.setup();
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);

    await user.click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));

    expect(
      await screen.findByText("등록 상태에서 확인할 항목이 없습니다")
    ).toBeTruthy();
  });

  it("explains actual index checks in Korean without claiming semantic conflicts", async () => {
    checkConsistencyMock.mockResolvedValue({ error: null, conflicts: [
      { entity_id: "e1", entity_name: "이서준", conflict_type: "MISSING_SUMMARY", detail: "English summary detail" },
      { entity_id: "e2", entity_name: "붉은 검", conflict_type: "UNTRACKED_MENTION", detail: "English mention detail" },
      { entity_id: "e3", entity_name: "영주", conflict_type: "EXPECTED_ENTITY_ABSENT", detail: "English absence detail" },
      { entity_id: null, entity_name: "숨겨진 편지", conflict_type: "DANGLING_FORESHADOW", detail: "English foreshadow detail" },
    ] });
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));
    expect(await screen.findByText("설명 미등록")).toBeTruthy();
    expect(screen.getByText("언급 기록 누락")).toBeTruthy();
    expect(screen.getByText("이전 등장 항목")).toBeTruthy();
    expect(screen.getByText("복선 회수 확인")).toBeTruthy();
    expect(screen.getByText(/3회 이상 언급된 항목/)).toBeTruthy();
    expect(screen.getByText(/의미적 모순을 검사하지 않습니다/)).toBeTruthy();
    expect(screen.queryByText(/English/)).toBeNull();
    expect(screen.getByText("이서준")).toBeTruthy();
  });

  it("calls toast.error and does not open the result panel when the action returns an error", async () => {
    checkConsistencyMock.mockResolvedValue({
      error: "권한이 없거나 존재하지 않는 챕터입니다",
      conflicts: [],
    });
    const user = userEvent.setup();
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);

    await user.click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "권한이 없거나 존재하지 않는 챕터입니다"
      )
    );
    expect(screen.queryByText("등록 상태에서 확인할 항목이 없습니다")).toBeNull();
  });

  it("dismisses the result panel when the close button is clicked", async () => {
    checkConsistencyMock.mockResolvedValue({ error: null, conflicts: [] });
    const user = userEvent.setup();
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);

    await user.click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));
    await screen.findByText("등록 상태에서 확인할 항목이 없습니다");

    await user.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.queryByText("등록 상태에서 확인할 항목이 없습니다")).toBeNull();
  });

  it("disables the button and shows a running label while chapterId is null", () => {
    render(<ConsistencyCheckButton chapterId={null} />);

    const button = screen.getByRole("button", {
      name: "기억 등록 상태 점검",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
  it("clears visible results immediately when the chapter changes", async () => {
    checkConsistencyMock.mockResolvedValue({ error: null, conflicts: [] });
    const { rerender } = render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));
    await screen.findByText("등록 상태에서 확인할 항목이 없습니다");
    rerender(<ConsistencyCheckButton chapterId="chapter-b" />);
    expect(screen.queryByText("기억 등록 상태 점검 결과")).toBeNull();
    expect((screen.getByRole("button", { name: "기억 등록 상태 점검" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(["success", "error", "rejection"])("ignores a late %s from another chapter", async (outcome) => {
    let resolve!: (value: unknown) => void;
    let reject!: (reason: Error) => void;
    checkConsistencyMock.mockReturnValueOnce(new Promise((res, rej) => { resolve = res; reject = rej; }));
    const { rerender } = render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));
    expect((screen.getByRole("button", { name: "점검 중..." }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<ConsistencyCheckButton chapterId="chapter-b" />);
    checkConsistencyMock.mockResolvedValueOnce({ error: null, conflicts: [{ entity_id: "b", entity_name: "B 회차 항목", conflict_type: "MISSING_SUMMARY", detail: "" }] });
    await userEvent.setup().click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));
    await screen.findByText("B 회차 항목");
    await act(async () => {
      if (outcome === "rejection") reject(new Error("late failure"));
      else resolve({ error: outcome === "error" ? "late error" : null, conflicts: [] });
    });
    expect(screen.getByText("B 회차 항목")).toBeTruthy();
    expect(screen.queryByText("등록 상태에서 확인할 항목이 없습니다")).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports a rejected request and allows retry", async () => {
    checkConsistencyMock.mockRejectedValueOnce(new Error("network"));
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("기억 등록 상태 점검에 실패했습니다. 잠시 후 다시 시도해 주세요."));
    expect((screen.getByRole("button", { name: "기억 등록 상태 점검" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("기억 등록 상태 점검 결과")).toBeNull();
  });

  it("ignores errors after unmount", async () => {
    let reject!: (reason: Error) => void;
    checkConsistencyMock.mockReturnValueOnce(new Promise((_, rej) => { reject = rej; }));
    const { unmount } = render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "기억 등록 상태 점검" }));
    unmount();
    await act(async () => { reject(new Error("late failure")); });
    expect(toast.error).not.toHaveBeenCalled();
  });

});
