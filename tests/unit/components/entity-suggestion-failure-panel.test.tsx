// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ failed: true, delayed: false }));
vi.mock("@/app/(dashboard)/projects/[id]/suggestion-actions", () => ({
  getSuggestions: vi.fn().mockResolvedValue({ error: null, suggestions: [{ id: "candidate", name: "검성", type: "CHARACTER" }] }),
  getSuggestionAliasTargets: vi.fn().mockResolvedValue({ error: null, entities: [] }),
  getFactSuggestions: vi.fn().mockResolvedValue({ error: null, suggestions: [] }),
}));
vi.mock("@/components/entity-suggestion-panel/use-suggestion-polling", () => ({
  useSuggestionPolling: () => ({ analyzing: false, analysisFailed: state.failed, analysisDelayed: state.delayed,
    analysisCompletedWithoutResults: false, autoRegisteredEntityCount: 0, autoRegisteredRelationCount: 0, autoRegisteredNames: [] }),
}));
vi.mock("@/components/entity-suggestion-panel/use-fact-suggestion-handlers", () => ({ useFactSuggestionHandlers: () => ({}) }));
vi.mock("@/components/entity-suggestion-panel/use-entity-suggestion-handlers", () => ({ useEntitySuggestionHandlers: () => ({}) }));
vi.mock("@/components/entity-suggestion-panel/suggestion-list", () => ({
  SuggestionList: ({ entitySuggestions }: { entitySuggestions: { id: string; name: string }[] }) => (
    <div>{entitySuggestions.map((candidate) => <span key={candidate.id}>{candidate.name}</span>)}</div>
  ),
}));
import { EntitySuggestionPanel } from "@/components/entity-suggestion-panel";

describe("candidate inbox terminal notice", () => {
  beforeEach(() => { state.failed = true; state.delayed = false; });
  it("retains the failure warning alongside existing candidates", async () => {
    render(<EntitySuggestionPanel projectId="project" chapterId="chapter" saveSignal={0} />);
    expect(await screen.findByText("검성")).toBeTruthy();
    expect(screen.getByText("원고는 저장됐습니다. 기억 정리를 끝내지 못했습니다.")).toBeTruthy();
    expect(screen.getByText("표시된 후보는 일부일 수 있습니다. 원문 근거를 확인해 주세요.")).toBeTruthy();
  });
  it("retains the delayed notice alongside candidates without claiming completion", async () => {
    state.failed = false; state.delayed = true;
    render(<EntitySuggestionPanel projectId="project" chapterId="chapter" saveSignal={0} />);
    expect(await screen.findByText("검성")).toBeTruthy();
    expect(screen.getByText("기억 정리 결과 확인이 지연되고 있습니다")).toBeTruthy();
    expect(screen.queryByText("후보 찾기가 완료되었습니다")).toBeNull();
  });
});
