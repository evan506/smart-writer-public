import type { ReactNode } from "react";
import type { AdminSnapshot } from "@/lib/services/admin-usage.service";

const features: Record<string, string> = {
  entity_extraction: "설정 추출", analysis: "분석", embedding: "검색 색인",
  report: "보고서", chat: "질문 답변", search_rag: "작품 기억 검색",
};
const reasons: Record<string, string> = {
  daily: "작품 하루 한도 도달", monthly: "작품 월 한도 도달",
  user_daily: "사용자 하루 한도 도달", user_monthly: "사용자 월 한도 도달",
  unavailable: "한도 조회 불가로 AI 처리 중단", scan_cap: "집계 범위 확인 필요로 AI 처리 중단",
};
const jobStates: Record<string, string> = {
  pending: "대기", queued: "대기", running: "진행 중", processing: "진행 중",
  completed: "완료", done: "완료", failed: "실패", cancelled: "취소",
};
const panelClass = "rounded-xl border border-sw-border-subtle bg-sw-bg-elevated p-5";
const inputClass = "rounded-md border border-sw-border-subtle bg-sw-bg-base px-3 py-2 text-sm";
const usd = (value: number | null | undefined) => value == null ? "조회 불가" : `$${value.toFixed(6)}`;
const count = (value: number | null) => value == null ? "조회 불가" : `${value.toLocaleString("ko-KR")}건`;
function time(value: string | null | undefined) {
  if (!value) return "기록 없음";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? `${parsed.toISOString().replace("T", " ").slice(0, 19)} UTC` : "시각 확인 불가";
}
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className={panelClass}><h2 className="mb-4 text-lg font-bold">{title}</h2>{children}</section>;
}
function Metric({ label, value }: { label: string; value: ReactNode }) {
  return <div><dt className="text-xs text-sw-text-muted">{label}</dt><dd className="mt-1 text-sm font-semibold break-words">{value}</dd></div>;
}

export function AdminDashboard({ snapshot: s, runtime }: {
  snapshot: AdminSnapshot;
  runtime: { commit: string | null; environment: string; supabaseUrl: string | null };
}) {
  const configured = [s.limits.dailyUsd, s.limits.monthlyUsd, s.limits.userDailyUsd, s.limits.userMonthlyUsd].some((limit) => limit != null);
  const status = !configured ? "한도 미설정" : s.decision?.allowed
    ? s.decision.warning ? `AI 사용 가능 · 한도 ${s.decision.warning.level}% 이상 사용` : "AI 사용 가능"
    : reasons[s.decision?.reason ?? "unavailable"];
  const budgets = [
    { label: "작품 · 오늘", used: s.totals?.project_day_usd, limit: s.limits.dailyUsd },
    { label: "작품 · 이번 달", used: s.totals?.project_month_usd, limit: s.limits.monthlyUsd },
    { label: "사용자 · 오늘", used: s.totals?.user_day_usd, limit: s.limits.userDailyUsd },
    { label: "사용자 · 이번 달", used: s.totals?.user_month_usd, limit: s.limits.userMonthlyUsd },
  ];
  return <div className="min-h-screen bg-sw-bg-base px-6 py-8 text-sw-text-primary lg:px-10">
    <div className="mx-auto max-w-6xl space-y-6">
      <header><p className="mb-2 text-xs text-sw-text-muted">읽기 전용 · 관리자</p><h1 className="text-2xl font-bold">AI 운영 현황</h1>
        <p className="mt-2 text-sm text-sw-text-muted">내 작품의 사용액과 기록을 확인합니다. 한도와 운영 설정은 이 화면에서 변경하지 않습니다.</p>
        <p className="mt-2 text-xs text-sw-text-muted">조회 시각: {time(s.checkedAt)} · 수동 조회</p></header>
      <form action="/admin" method="get" className={`${panelClass} flex flex-wrap items-end gap-4`}>
        <label className="flex min-w-48 flex-col gap-1 text-xs">작품<select name="project" defaultValue={s.selected?.id ?? ""} className={inputClass}>
          {!s.projects.length && <option value="">작품 없음</option>}
          {s.projects.map((p) => <option value={p.id} key={p.id}>{p.title}</option>)}
        </select></label>
        <label className="flex flex-col gap-1 text-xs">최근 기록 기간<select name="days" defaultValue={s.filters.days} className={inputClass}>{[1, 7, 30, 90].map((day) => <option key={day} value={day}>최근 {day}일</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs">기능<select name="feature" defaultValue={s.filters.feature} className={inputClass}><option value="">전체 기능</option>{Object.entries(features).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="flex flex-col gap-1 text-xs">결과<select name="status" defaultValue={s.filters.status} className={inputClass}><option value="">전체 결과</option><option value="success">성공</option><option value="error">실패</option></select></label>
        <button type="submit" className="rounded-md border border-sw-border-subtle px-4 py-2 text-sm font-semibold hover:bg-sw-bg-base">조회/새로고침</button>
        {s.moreProjects && <p className="w-full text-xs text-sw-text-muted">최근 작품 100개를 표시합니다.</p>}
      </form>
      {!s.selected ? <Panel title="아직 작품이 없습니다"><p className="text-sm text-sw-text-muted">작품을 만든 뒤 사용 기록을 확인할 수 있습니다.</p></Panel> : <>
        <Panel title="사용액과 한도">
          <p className="mb-4 text-sm font-semibold" role="status">{status}</p>
          <p className="mb-4 text-xs text-sw-text-muted">오늘과 이번 달은 UTC 기준이며 최근 기록 필터와 무관한 전체 합계입니다. 사용자 합계는 모든 본인 작품에서 본인 사용자 ID가 기록된 사용만 포함합니다. 사용자 ID 누락 기록은 작품 합계에는 포함되지만 사용자 한도 계산에서는 제외됩니다.</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{budgets.map((budget) => <div key={budget.label} className="rounded-lg border border-sw-border-subtle p-4"><h3 className="mb-3 text-sm font-bold">{budget.label}</h3><dl className="space-y-3">
            <Metric label="사용액 (USD)" value={usd(budget.used)} />
            <Metric label="한도 (USD)" value={budget.limit == null ? "미설정" : usd(budget.limit)} />
            <Metric label="잔여액 (USD)" value={budget.limit == null ? "한도 미설정" : budget.used == null ? "조회 불가" : usd(Math.max(0, budget.limit - budget.used))} />
          </dl></div>)}</div>
          <p className="mt-4 text-xs text-sw-text-muted">이번 달 비용 미확정: 작품 {count(s.totals?.project_unknown_cost_count ?? null)} · 사용자 {count(s.totals?.user_unknown_cost_count ?? null)}. 최근 기록 필터와 무관합니다.</p>
          <p className="mt-4 text-xs text-sw-text-muted">비용 미확정 기록은 임의 금액으로 계산하지 않습니다. 진행 중인 요청의 예약 금액은 합계에 포함되지 않습니다. 집계 요청 응답 시간: {s.aggregateMs == null ? "조회 불가" : `${s.aggregateMs}ms`} (이번 조회, 서버와 DB 간 왕복 포함).</p>
        </Panel>
        <Panel title="기록 확인">
          <p className="mb-4 text-xs text-sw-text-muted">선택한 작품의 최근 {s.filters.days}일 및 기능·결과 필터에 해당하는 전체 기록입니다.</p>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="전체 호출 기록" value={count(s.counts.total)} /><Metric label="사용자 ID 누락" value={count(s.counts.missingUser)} /><Metric label="비용 미확정" value={count(s.counts.unknownCost)} /><Metric label="실패 기록" value={count(s.counts.errors)} /></dl>
          <p className="mt-4 text-sm">작품의 마지막 AI 기록: {s.latestUsageUnavailable ? "조회 불가" : time(s.latestUsage)}</p>
          <p className="mt-2 text-xs text-sw-text-muted">마지막 기록은 기간·기능·결과 필터와 무관합니다. 기록이 없거나 오래됐다는 이유만으로 정상 또는 장애로 판단하지 않습니다.</p>
        </Panel>
        <Panel title="최근 AI 호출">
          <p className="mb-2 text-xs text-sw-text-muted">호출 성공은 AI 응답을 받았다는 뜻입니다. 응답 해석이나 기억 정리가 실패하면 분석 작업은 실패로 표시될 수 있으며, 호출 비용은 그대로 기록됩니다.</p>
          <p className="mb-4 text-xs text-sw-text-muted">최신순 최대 50건 표본입니다. 전체 사용액과 건수는 위의 별도 집계를 사용합니다.</p>
          {s.recent === null ? <p className="text-sm">최근 기록 조회 불가</p> : !s.recent.length ? <p className="text-sm">선택한 조건에 기록이 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{["시각 (UTC)", "기능", "모델", "결과", "비용 (USD)", "응답 시간", "토큰", "재시도", "사용자 기록"].map((label) => <th key={label} scope="col" className="border-b border-sw-border-subtle p-2 font-semibold">{label}</th>)}</tr></thead><tbody>{s.recent.map((row) => <tr key={row.id} className="border-b border-sw-border-subtle"><td className="p-2">{time(row.created_at)}</td><td className="p-2">{features[row.feature] ?? "기타"}</td><td className="max-w-64 truncate p-2" title={row.model}>{row.model}</td><td className="p-2">{row.status === "success" ? "성공" : row.status === "error" ? "실패" : "기타"}{row.timed_out ? " · 시간 초과" : ""}</td><td className="p-2">{row.cost_usd == null ? "미확정" : usd(row.cost_usd)}</td><td className="p-2">{row.latency_ms == null ? "미확정" : `${row.latency_ms}ms`}</td><td className="p-2">{row.total_tokens ?? "미확정"}</td><td className="p-2">{row.retry_count ?? "미확정"}</td><td className="p-2">{row.user_id ? "있음" : "누락"}</td></tr>)}</tbody></table></div>}
        </Panel>
        <Panel title="원고 저장과 분석 작업">
          <p className="text-sm">최근 원고 DB 저장 시각: {s.chaptersUnavailable ? "조회 불가" : time(s.latestChapter?.updated_at)}</p>
          {s.latestChapter && <p className="mt-1 text-sm text-sw-text-muted">{s.latestChapter.chapter_num}화 {s.latestChapter.title}</p>}
          <p className="mb-4 mt-2 text-xs text-sw-text-muted">DB의 저장 시각입니다. 원고 내용이나 브라우저 자동 저장 성공을 검사한 결과는 아닙니다.</p>
          <h3 className="mb-2 text-sm font-bold">최근 분석 작업 · 최대 5건</h3>
          {s.jobs === null ? <p className="text-sm">분석 작업 조회 불가</p> : !s.jobs.length ? <p className="text-sm">분석 작업 기록 없음</p> : <ul className="space-y-2 text-sm">{s.jobs.map((job) => <li key={job.id}>{jobStates[job.status.toLowerCase()] ?? "기타 상태"} · 갱신 {time(job.updated_at)}{job.finished_at ? ` · 종료 ${time(job.finished_at)}` : ""}</li>)}</ul>}
        </Panel>
      </>}
      <Panel title="실행 환경과 운영 콘솔"><dl className="grid gap-4 sm:grid-cols-2"><Metric label="현재 요청의 실행 환경" value={runtime.environment} /><Metric label="현재 빌드 커밋" value={runtime.commit ?? "확인 불가"} /></dl>
        <div className="mt-4 flex gap-4 text-sm underline"><a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">Vercel 콘솔</a><a href={runtime.supabaseUrl ?? "https://supabase.com/dashboard"} target="_blank" rel="noopener noreferrer">Supabase 콘솔</a></div>
        <p className="mt-3 text-xs text-sw-text-muted">CPU와 DB 내부 실행 시간은 각 콘솔에서 확인하세요. 이 화면은 실시간 배포 최신성이나 서버 상태를 측정하지 않습니다.</p>
      </Panel>
    </div>
  </div>;
}
