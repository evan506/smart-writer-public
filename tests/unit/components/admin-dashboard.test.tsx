import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import type { AdminSnapshot } from "@/lib/services/admin-usage.service";

function snapshot(overrides: Partial<AdminSnapshot> = {}): AdminSnapshot {
  return {
    checkedAt: "2026-10-10T00:00:00Z", filters: { days: 7, feature: "", status: "" },
    projects: [{ id: "project", title: "테스트 작품" }], moreProjects: false,
    selected: { id: "project", title: "테스트 작품" },
    limits: { dailyUsd: null, monthlyUsd: null }, totals: null,
    decision: { allowed: true, reason: null, warning: null }, aggregateMs: null,
    recent: [], counts: { total: 0, missingUser: 0, unknownCost: 0, errors: 0 },
    latestUsage: null, latestUsageUnavailable: false,
    latestChapter: null, chaptersUnavailable: false, jobs: [], ...overrides,
  };
}
function html(value: AdminSnapshot) {
  return renderToStaticMarkup(<AdminDashboard snapshot={value} runtime={{ commit: null, environment: "로컬", supabaseUrl: null }} />);
}

describe("read-only admin display", () => {
  it("keeps unset limits distinct from unavailable totals without reporting an AI block", () => {
    const page = html(snapshot());
    expect(page).toContain("한도 미설정");
    expect(page).toContain("조회 불가");
    expect(page).not.toContain("AI 처리 중단");
    expect(page).toContain("기록이 없거나 오래됐다는 이유만으로 정상 또는 장애로 판단하지 않습니다");
    expect(page).toContain("호출 성공은 AI 응답을 받았다는 뜻");
    expect(page).toContain("분석 작업은 실패로 표시될 수 있으며, 호출 비용은 그대로 기록");
  });
  it("shows the exact guard reason and clamps the known remaining amount to zero", () => {
    const page = html(snapshot({
      limits: { dailyUsd: null, monthlyUsd: 1 },
      totals: { authorized: true, project_day_usd: 0, project_month_usd: 2,
        user_day_usd: 0, user_month_usd: 2, project_unknown_cost_count: 0, user_unknown_cost_count: 0 },
      decision: { allowed: false, reason: "monthly", warning: null },
    }));
    expect(page).toContain("작품 월 한도 도달");
    expect(page).toContain("$0.000000");
    expect(page).toContain("이번 달 비용 미확정: 작품 0건 · 사용자 0건");
    expect(page).toContain("사용자 ID 누락 기록은 작품 합계에는 포함되지만 사용자 한도 계산에서는 제외됩니다");
    expect(page).not.toContain("$-1");
  });
  it("keeps read failures distinct from empty successful queries", () => {
    const page = html(snapshot({
      limits: { dailyUsd: 1, monthlyUsd: null },
      decision: { allowed: false, reason: "unavailable", warning: null },
      recent: null, counts: { total: null, missingUser: null, unknownCost: null, errors: null },
      latestUsageUnavailable: true, chaptersUnavailable: true, jobs: null,
    }));
    expect(page).toContain("한도 조회 불가로 AI 처리 중단");
    expect(page).toContain("최근 기록 조회 불가");
    expect(page).toContain("분석 작업 조회 불가");
    expect(page).not.toContain("선택한 조건에 기록이 없습니다");
  });
  it("labels bounded recent rows as a sample, never displays user IDs, and submits GET only", () => {
    const page = html(snapshot({
      counts: { total: 1500, missingUser: 1, unknownCost: 1, errors: 0 },
      recent: [{ id: "log", created_at: "2026-10-10T00:00:00Z", feature: "embedding", model: "test-model",
        status: "success", cost_usd: null, latency_ms: null, retry_count: 0, total_tokens: null,
        user_id: "private-user-identifier", timed_out: false }],
    }));
    expect(page).toContain("최신순 최대 50건 표본");
    expect(page).toContain("1,500건");
    expect(page).toContain("미확정");
    expect(page).not.toContain("private-user-identifier");
    expect(page).toContain('method="get"');
    expect(page).not.toContain('method="post"');
  });
  it("explains an empty owned-project list without implying zero spending", () => {
    const page = html(snapshot({ projects: [], selected: null }));
    expect(page).toContain("아직 작품이 없습니다");
    expect(page).not.toContain("$0.000000");
  });
});
