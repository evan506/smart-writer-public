// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

    await user.click(screen.getByRole("button", { name: "일관성 검사" }));

    await waitFor(() =>
      expect(checkConsistencyMock).toHaveBeenCalledWith(CHAPTER_ID)
    );
  });

  it("renders the empty-state message when there are no conflicts", async () => {
    checkConsistencyMock.mockResolvedValue({ error: null, conflicts: [] });
    const user = userEvent.setup();
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);

    await user.click(screen.getByRole("button", { name: "일관성 검사" }));

    expect(
      await screen.findByText("발견된 설정 충돌이 없습니다")
    ).toBeTruthy();
  });

  it("renders each conflict entry with entity name, type, and detail", async () => {
    checkConsistencyMock.mockResolvedValue({
      error: null,
      conflicts: [
        {
          entity_id: "e1",
          entity_name: "이서준",
          conflict_type: "설정 불일치",
          detail: "3장에서는 검사였다가 5장에서는 마법사로 서술됩니다",
        },
        {
          entity_id: "e2",
          entity_name: "붉은 검",
          conflict_type: "속성 충돌",
          detail: "무게가 챕터마다 다르게 서술됩니다",
        },
      ],
    });
    const user = userEvent.setup();
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);

    await user.click(screen.getByRole("button", { name: "일관성 검사" }));

    expect(await screen.findByText("이서준")).toBeTruthy();
    expect(screen.getByText("설정 불일치")).toBeTruthy();
    expect(
      screen.getByText("3장에서는 검사였다가 5장에서는 마법사로 서술됩니다")
    ).toBeTruthy();
    expect(screen.getByText("붉은 검")).toBeTruthy();
    expect(screen.getByText("속성 충돌")).toBeTruthy();
  });

  it("calls toast.error and does not open the result panel when the action returns an error", async () => {
    checkConsistencyMock.mockResolvedValue({
      error: "권한이 없거나 존재하지 않는 챕터입니다",
      conflicts: [],
    });
    const user = userEvent.setup();
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);

    await user.click(screen.getByRole("button", { name: "일관성 검사" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "권한이 없거나 존재하지 않는 챕터입니다"
      )
    );
    expect(screen.queryByText("발견된 설정 충돌이 없습니다")).toBeNull();
  });

  it("dismisses the result panel when the close button is clicked", async () => {
    checkConsistencyMock.mockResolvedValue({ error: null, conflicts: [] });
    const user = userEvent.setup();
    render(<ConsistencyCheckButton chapterId={CHAPTER_ID} />);

    await user.click(screen.getByRole("button", { name: "일관성 검사" }));
    await screen.findByText("발견된 설정 충돌이 없습니다");

    await user.click(screen.getByRole("button", { name: "닫기" }));

    expect(screen.queryByText("발견된 설정 충돌이 없습니다")).toBeNull();
  });

  it("disables the button and shows a running label while chapterId is null", () => {
    render(<ConsistencyCheckButton chapterId={null} />);

    const button = screen.getByRole("button", {
      name: "일관성 검사",
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });
});
