import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AnalysisFailedState,
  AnalyzingState,
  EmptyState,
  LoadingState,
} from "@/components/entity-suggestion-panel/status-states";

describe("suggestion panel status states", () => {
  it("describes loading as opening the review inbox", () => {
    const html = renderToStaticMarkup(<LoadingState />);

    expect(html).toContain("후보 검토함을 불러오는 중입니다");
  });

  it("includes fact candidates in the analyzing and failed states", () => {
    const analyzingHtml = renderToStaticMarkup(<AnalyzingState />);
    const failedHtml = renderToStaticMarkup(<AnalysisFailedState />);

    expect(analyzingHtml).toContain("인물, 장소, 관계, 세부 설정");
    expect(failedHtml).toContain("설정 후보와 세부 설정 후보를 다시 찾습니다");
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
