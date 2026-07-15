import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  FactSuggestionList,
  type FactSuggestionView,
} from "@/components/entity-suggestion-panel/fact-suggestion-list";

function suggestion(overrides: Partial<FactSuggestionView> = {}): FactSuggestionView {
  return {
    id: "fact-suggestion-1",
    chapterNum: 1,
    chapterTitle: "첫 장면",
    entityName: "리엔",
    entitySuggestionId: null,
    entitySuggestionName: null,
    factType: "ATTRIBUTE",
    factKey: "species",
    value: "하이엘프다",
    evidenceText: "리엔은 하이엘프라고 소개됐다.",
    confidence: 0.87,
    canApprove: true,
    existingFactId: null,
    existingSourceCount: 0,
    conflictingFactId: null,
    conflictingValue: null,
    approvalMode: "CREATE_FACT",
    ...overrides,
  };
}

function render(suggestions: FactSuggestionView[]) {
  return renderToStaticMarkup(
    <FactSuggestionList
      suggestions={suggestions}
      isPending={false}
      onConfirm={vi.fn()}
      onConfirmBatch={vi.fn()}
      onSupersede={vi.fn()}
      onDismiss={vi.fn()}
      onLocateEntitySuggestion={vi.fn()}
    />
  );
}

describe("FactSuggestionList", () => {
  it("shows CREATE_FACT as a new setting save action", () => {
    const html = render([suggestion()]);

    expect(html).toContain("검토할 세부 설정 (1)");
    expect(html).toContain("리엔");
    expect(html).toContain("작품 기억");
    expect(html).toContain("새 설정 후보");
    expect(html).toContain("species:");
    expect(html).toContain("하이엘프다");
    expect(html).toContain("리엔은 하이엘프라고 소개됐다.");
    expect(html).toContain("title=\"설정으로 저장\"");
    expect(html).not.toContain("이미 승인된 설정입니다.");
  });

  it("shows WAIT_FOR_ENTITY as blocked until the entity suggestion is confirmed", () => {
    const html = render([
      suggestion({
        entityName: null,
        entitySuggestionId: "entity-suggestion-1",
        entitySuggestionName: "하피",
        canApprove: false,
        approvalMode: "WAIT_FOR_ENTITY",
      }),
    ]);

    expect(html).toContain("하피");
    expect(html).toContain("항목 후보");
    expect(html).toContain("항목 승인 대기");
    expect(html).toContain("항목 연결이 먼저 필요합니다");
    expect(html).toContain("관련 항목 후보 보기");
    expect(html).toContain("항목 승인 후 저장 가능");
    expect(html).toContain("title=\"먼저 항목 후보를 작품 기억으로 승인해야 합니다\"");
    expect(html).toContain("disabled=\"\"");
    expect(html).not.toContain("기존 설정에 근거 추가");
  });

  it("shows ADD_SOURCE as evidence addition without implying a duplicate fact", () => {
    const html = render([
      suggestion({
        existingFactId: "fact-existing",
        existingSourceCount: 2,
        approvalMode: "ADD_SOURCE",
      }),
    ]);

    expect(html).toContain("근거 추가 후보");
    expect(html).toContain("같은 설정이 이미 작품 기억에 있습니다.");
    expect(html).toContain("새 설정을 만들지 않고 원문 근거 3번째로 추가됩니다.");
    expect(html).toContain("title=\"기존 설정에 근거 추가\"");
    expect(html).not.toContain("항목 승인 후 저장 가능");
  });

  it("warns when CREATE_FACT differs from an already approved setting", () => {
    const html = render([
      suggestion({
        factKey: "species",
        value: "인간이다",
        conflictingFactId: "fact-conflict",
        conflictingValue: "하이엘프다",
      }),
    ]);

    expect(html).toContain("기존 승인 설정과 값이 다릅니다");
    expect(html).toContain("하이엘프다");
    expect(html).toContain("기존: 하이엘프다 · 새 후보: 인간이다");
    expect(html).toContain("체크 버튼은 새 설정으로 따로 저장");
    expect(html).toContain("title=\"새 설정으로 따로 저장\"");
    expect(html).toContain("title=\"기존 설정을 이 설정으로 대체\"");
  });

  describe("batch approve button", () => {
    it("hides the batch button when fewer than 2 items are approvable", () => {
      const html = render([
        suggestion({ id: "fact-1" }),
        suggestion({
          id: "fact-2",
          entityName: null,
          entitySuggestionId: "entity-suggestion-1",
          entitySuggestionName: "하피",
          canApprove: false,
          approvalMode: "WAIT_FOR_ENTITY",
        }),
      ]);

      expect(html).not.toContain("모두 저장");
    });

    it("shows the batch button and excludes WAIT_FOR_ENTITY and conflicting items from the count", () => {
      const html = render([
        suggestion({ id: "fact-1" }),
        suggestion({ id: "fact-2", value: "다른 설정" }),
        suggestion({
          id: "fact-3",
          entityName: null,
          entitySuggestionId: "entity-suggestion-1",
          entitySuggestionName: "하피",
          canApprove: false,
          approvalMode: "WAIT_FOR_ENTITY",
        }),
        suggestion({
          id: "fact-4",
          factKey: "species",
          value: "인간이다",
          conflictingFactId: "fact-conflict",
          conflictingValue: "하이엘프다",
        }),
      ]);

      expect(html).toContain("설정 2개 모두 저장");
    });

    it("counts ADD_SOURCE items as approvable for the batch button", () => {
      const html = render([
        suggestion({ id: "fact-1", approvalMode: "ADD_SOURCE", existingFactId: "fact-existing" }),
        suggestion({ id: "fact-2" }),
      ]);

      expect(html).toContain("설정 2개 모두 저장");
    });
  });
});
