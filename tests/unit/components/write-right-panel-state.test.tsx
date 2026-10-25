// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { WriteRightPanel } from "@/components/write/write-right-panel";
vi.mock("@/components/canon-qa-panel", () => ({ CanonQAPanel: function Question() {
  const [draft, setDraft] = useState("");
  return <input aria-label="질문 초안" value={draft} onChange={e => setDraft(e.target.value)} />;
} }));
vi.mock("@/components/entity-suggestion-panel", () => ({ EntitySuggestionPanel: () => <p>확인 목록</p> }));
vi.mock("@/components/write/codex-panel", () => ({ CodexPanel: () => <p>사전 목록</p> }));
afterEach(cleanup);
describe("writing tool state", () => {
  it("preserves a question draft across dictionary and review tabs", () => {
    const props = { projectId: "local-project", saveSignal: 0 };
    const { rerender } = render(<WriteRightPanel {...props} activeTab="qa" />);
    fireEvent.change(screen.getByRole("textbox", { name: "질문 초안" }), { target: { value: "앞 장면의 단서는?" } });
    for (const activeTab of ["codex", "suggestions"] as const) {
      rerender(<WriteRightPanel {...props} activeTab={activeTab} />);
      expect(screen.queryByRole("textbox", { name: "질문 초안" })).toBeNull();
    }
    rerender(<WriteRightPanel {...props} activeTab="qa" />);
    expect((screen.getByRole("textbox", { name: "질문 초안" }) as HTMLInputElement).value).toBe("앞 장면의 단서는?");
  });
});
