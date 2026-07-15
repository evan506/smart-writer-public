// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlotThreadMatrixView } from "@/components/planning/plot-thread/plot-thread-matrix-view";
import type {
  PlotThreadChapterColumn,
  PlotThreadMatrix as PlotThreadMatrixModel,
  PlotThreadSummary,
} from "@/lib/services/plot-thread/read.service";

const refreshMock = vi.hoisted(() => vi.fn());
const updatePlotThreadMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

vi.mock("@/app/(dashboard)/projects/[id]/plot-thread-actions", () => ({
  createPlotThread: vi.fn(),
  updatePlotThread: updatePlotThreadMock,
  deletePlotThread: vi.fn(),
  linkThreadToPlanningBlock: vi.fn(),
  unlinkThreadFromPlanningBlock: vi.fn(),
  linkThreadToChapter: vi.fn(),
  unlinkThreadFromChapter: vi.fn(),
}));

const projectId = "11111111-1111-4111-8111-111111111111";
const threadId = "22222222-2222-4222-8222-222222222222";

const CHAPTERS: PlotThreadChapterColumn[] = [
  { id: "c1", chapterNum: 1, title: "귀환" },
];

function matrixModel(): PlotThreadMatrixModel {
  return {
    threadId,
    title: "황태자 암살 음모",
    summary: "궁정의 배후",
    rows: [],
    summaryRow: { cells: [] },
    signalChapterIds: [],
  };
}

function thread(overrides: Partial<PlotThreadSummary> = {}): PlotThreadSummary {
  return {
    id: threadId,
    title: "황태자 암살 음모",
    summary: "궁정의 배후",
    position: 0,
    linkedBlockCount: 0,
    connectedChapterCount: 0,
    ...overrides,
  };
}

function renderView() {
  return render(
    <PlotThreadMatrixView
      projectId={projectId}
      threads={[thread()]}
      chapters={CHAPTERS}
      matrices={{ [threadId]: matrixModel() }}
      linkableBlocks={[]}
      onSwitchToTree={() => {}}
    />
  );
}

describe("PlotThreadMatrixView — title/summary edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updatePlotThreadMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("initially shows the selected thread's title and summary in the edit form", () => {
    renderView();
    expect((screen.getByLabelText("제목") as HTMLInputElement).value).toBe(
      "황태자 암살 음모"
    );
    expect(
      (screen.getByLabelText("간단한 설명 (선택)") as HTMLTextAreaElement).value
    ).toBe("궁정의 배후");
  });

  it("calls updatePlotThread with the edited title/summary payload", async () => {
    const user = userEvent.setup();
    renderView();

    const title = screen.getByLabelText("제목");
    const summary = screen.getByLabelText("간단한 설명 (선택)");
    await user.clear(title);
    await user.type(title, "암살 음모 (수정)");
    await user.clear(summary);
    await user.type(summary, "배후를 좁혀간다");

    await user.click(screen.getByRole("button", { name: /제목·설명 저장/ }));

    await waitFor(() => expect(updatePlotThreadMock).toHaveBeenCalledTimes(1));
    expect(updatePlotThreadMock).toHaveBeenCalledWith({
      projectId,
      threadId,
      title: "암살 음모 (수정)",
      summary: "배후를 좁혀간다",
    });
  });

  it("saves an empty summary as null", async () => {
    const user = userEvent.setup();
    renderView();

    await user.clear(screen.getByLabelText("간단한 설명 (선택)"));
    await user.click(screen.getByRole("button", { name: /제목·설명 저장/ }));

    await waitFor(() => expect(updatePlotThreadMock).toHaveBeenCalledTimes(1));
    expect(updatePlotThreadMock).toHaveBeenCalledWith(
      expect.objectContaining({ threadId, summary: null })
    );
  });

  it("shows an error notice when the action fails and does not refresh", async () => {
    updatePlotThreadMock.mockResolvedValue({ error: "플롯 스레드를 찾을 수 없습니다" });
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: /제목·설명 저장/ }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("플롯 스레드를 찾을 수 없습니다");
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("refreshes after a successful save", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: /제목·설명 저장/ }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  it("blocks save with an empty title (does not call the action)", async () => {
    const user = userEvent.setup();
    renderView();

    await user.clear(screen.getByLabelText("제목"));
    const saveBtn = screen.getByRole("button", {
      name: /제목·설명 저장/,
    }) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
    await user.click(saveBtn);
    expect(updatePlotThreadMock).not.toHaveBeenCalled();
  });
});
