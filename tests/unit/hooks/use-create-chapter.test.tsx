// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCreateChapter } from "@/hooks/use-create-chapter";
import type { Chapter } from "@/types";
const { action, errorToast } = vi.hoisted(() => ({ action: vi.fn(), errorToast: vi.fn() }));
vi.mock("@/app/(dashboard)/projects/[id]/chapters-actions", () => ({ createChapter: action }));
vi.mock("sonner", () => ({ toast: { error: errorToast } }));
const chapter = { id: "created", chapter_num: 12 } as Chapter;
const success = { error: null, id: chapter.id, chapter };

describe("workspace chapter creation", () => {
  beforeEach(() => vi.resetAllMocks());
  it("shares one immediate flight and awaits the actual chapter callback", async () => {
    let resolve!: (value: typeof success) => void;
    action.mockReturnValue(new Promise((r) => { resolve = r; }));
    let completeCallback!: () => void;
    const onCreated = vi.fn(() => new Promise<void>((r) => { completeCallback = r; }));
    const { result } = renderHook(() => useCreateChapter("project", onCreated));
    act(() => { void result.current.create(); void result.current.create(); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.isCreating).toBe(true);
    await act(async () => resolve(success));
    expect(onCreated).toHaveBeenCalledWith(chapter);
    expect(result.current.isCreating).toBe(true);
    act(() => { void result.current.create(); });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => completeCallback());
    expect(result.current.isCreating).toBe(false);
  });
  it.each(["error", "rejection"])("reuses identity after %s and resets only after success", async (failure) => {
    if (failure === "error") action.mockResolvedValueOnce({ error: "재시도", id: null, chapter: null });
    else action.mockRejectedValueOnce(new Error("response lost"));
    action.mockResolvedValue(success);
    const callback = vi.fn();
    const { result } = renderHook(() => useCreateChapter("project", callback));
    await act(async () => result.current.create());
    const firstId = action.mock.calls[0][0].get("requestId");
    expect(result.current.isCreating).toBe(false);
    expect(errorToast).toHaveBeenCalledTimes(1);
    await act(async () => result.current.create());
    expect(action.mock.calls[1][0].get("requestId")).toBe(firstId);
    expect(callback).toHaveBeenCalledWith(chapter);
    await act(async () => result.current.create());
    expect(action.mock.calls[2][0].get("requestId")).not.toBe(firstId);
  });
  it("does not reuse a failed request identity in another project", async () => {
    action.mockRejectedValue(new Error("offline"));
    const callback = vi.fn();
    const { result, rerender } = renderHook(({ project }) => useCreateChapter(project, callback), { initialProps: { project: "a" } });
    await act(async () => result.current.create());
    rerender({ project: "b" });
    await act(async () => result.current.create());
    expect(action.mock.calls[0][0].get("requestId")).not.toBe(action.mock.calls[1][0].get("requestId"));
    expect(action.mock.calls[1][0].get("projectId")).toBe("b");
  });
});
