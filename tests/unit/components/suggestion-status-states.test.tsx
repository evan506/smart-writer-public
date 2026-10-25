import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AnalysisDelayedState,
  AnalysisFailedState,
  AnalyzingState,
  EmptyState,
  LoadingState,
} from "@/components/entity-suggestion-panel/status-states";

import { CodexStatusBadge } from "@/components/codex-full-page/codex-status-badge";

describe("suggestion panel status states", () => {
  it("does not infer human approval from a saved legacy item", () => {
    const html = renderToStaticMarkup(<CodexStatusBadge status="confirmed" />);
    expect(html).toContain("저장됨");
    expect(html).not.toContain("작가 승인");
  });

  it("describes loading as opening the review inbox", () => {
    const html = renderToStaticMarkup(<LoadingState />);

    expect(html).toContain("후보 검토함을 불러오는 중입니다");
  });

  it("includes fact candidates in the analyzing and failed states", () => {
    const analyzingHtml = renderToStaticMarkup(<AnalyzingState />);
    const failedHtml = renderToStaticMarkup(<AnalysisFailedState />);

    expect(analyzingHtml).toContain("인물, 장소, 관계, 세부 설정");
    expect(failedHtml).toContain("원고는 저장됐습니다");
    expect(failedHtml).toContain("표시된 후보는 일부일 수 있습니다");
    expect(failedHtml).not.toContain("다시 저장");
  });

  it("describes delayed confirmation without claiming completion", () => {
    const html = renderToStaticMarkup(<AnalysisDelayedState />);
    expect(html).toContain("결과 확인이 지연");
    expect(html).toContain("완료 여부는 아직 확인하지 못했습니다");
    expect(html).not.toContain("후보 찾기가 완료되었습니다");
  });

  it("keeps the empty state clear before any candidates are found", () => {
    const html = renderToStaticMarkup(
      <EmptyState
        autoRegisteredEntityCount={0}
        autoRegisteredRelationCount={0}
        autoRegisteredNames={[]}
        analysisCompletedWithoutResults={false}
      />
    );

    expect(html).toContain("아직 확인할 설정 후보가 없습니다");
    expect(html).toContain("작품 기억에 남길 항목과 세부 설정");
  });
});
