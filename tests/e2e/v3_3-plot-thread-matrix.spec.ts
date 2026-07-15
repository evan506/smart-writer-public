import { expect, test, type Page } from "@playwright/test";
import { getAuthE2EEnv } from "./helpers/auth-seed";
import {
  cleanupPlotThreadE2E,
  globalPlotThreadCounts,
  loadEnvLocal,
  readPlotThreadState,
  residueForProject,
  seedPlotThreadE2E,
  snapshotImmutableTables,
  type PlotThreadE2EEnv,
  type PlotThreadSeed,
} from "./helpers/plot-thread-seed";

// ─────────────────────────────────────────────────────────────────────────────
// V3.3 — plot-thread × chapter matrix, full author journey.
//
// This spec has a deterministic fixture + finally-style cleanup. The full author
// journey was executed once via an MCP-driven remote browser smoke on 2026-06-22
// (fixture residue 0 confirmed); this file codifies that flow.
//
// It SELF-SKIPS unless the required env is deliberately provided, via the e2e
// remote guard (getAuthE2EEnv): a protected service-role key (the auth-user
// cleanup that guarantees residue 0 cannot run with the anon key, by
// e2e-data-policy design), plus SMART_WRITER_AUTH_E2E_TESTS=1, and — for a
// non-local Supabase URL — ALLOW_REMOTE_AUTH_E2E_TESTS=1. The current environment
// and CI do NOT supply these, so the suite self-skips there; this is NOT "runs in
// CI". A full CI run requires a separate workflow/approval that intentionally
// injects the protected secret + both flags.
//
// Asserts split:
//   • UI (browser): tab switch, create/edit thread, link card/chapter, the
//     manual vs evidence vs manual+evidence cell distinction, the evidence
//     inspector (excerpt + 작품 기억 + 원고/Codex/구상 affordances), and unlink.
//   • DB (service role): thread/link rows after each mutation; a before/after
//     immutability fingerprint proving the journey never auto-mutated planning
//     blocks, planning links, chapters, entities, canon facts, fact sources, or
//     entity suggestions; finally cleanup + residue 0 + global blast-radius.
//
// NOTE on the immutability baseline: the planning page creates a one-time
// default 4-act structure scaffold (ROOT blocks) on first load. The baseline is
// therefore captured AFTER the first /planning load + tab switch, so it isolates
// the plot-thread journey's effect (which must be zero).
// ─────────────────────────────────────────────────────────────────────────────

// The 3-column matrix layout needs an xl-wide viewport so the controls column
// and the matrix never overlap (otherwise link buttons can be pointer-blocked).
test.use({ viewport: { width: 1440, height: 1000 } });

let env: PlotThreadE2EEnv | null = null;
let seed: PlotThreadSeed | null = null;

function planningEnv(): PlotThreadE2EEnv | null {
  const base = getAuthE2EEnv();
  if (!base.enabled) return null;
  return { url: base.url, serviceKey: base.serviceKey };
}

async function login(page: Page, s: PlotThreadSeed) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(s.email);
  await page.getByLabel("비밀번호").fill(s.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/projects$/);
}

test.describe("V3.3 plot-thread matrix author journey", () => {
  test.beforeAll(async () => {
    loadEnvLocal();
    env = planningEnv();
    if (!env) return;
    seed = await seedPlotThreadE2E(env);
  });

  test.afterAll(async () => {
    // finally-style cleanup: runs regardless of pass/fail.
    if (env && seed) {
      await cleanupPlotThreadE2E(env, {
        projectId: seed.projectId,
        userId: seed.userId,
      });
      const residue = await residueForProject(env, seed.projectId, seed.stamp);
      expect(residue.projects).toBe(0);
      expect(residue.threads).toBe(0);
      expect(residue.blockLinks).toBe(0);
      expect(residue.chapterLinks).toBe(0);
      // blast-radius: the run created no net plot-thread rows.
      const counts = await globalPlotThreadCounts(env);
      expect(counts.threads).toBe(0);
      expect(counts.blockLinks).toBe(0);
      expect(counts.chapterLinks).toBe(0);
    }
  });

  test("create, edit, link, inspect evidence, and unlink — without mutating planning/manuscript/codex", async ({
    page,
  }) => {
    const guard = getAuthE2EEnv();
    test.skip(!guard.enabled, guard.enabled ? "" : guard.reason);
    test.skip(!seed || !env, "plot-thread e2e seed was not created");
    const s = seed!;
    const e = env!;

    // 1) login → 2) open planning
    await login(page, s);
    await page.goto(`/projects/${s.projectId}/planning`);

    // 3) switch to the 플롯 스레드 view
    await page.getByRole("tab", { name: "플롯 스레드" }).click();
    await expect(
      page.getByRole("heading", { name: "플롯 스레드 × 회차" })
    ).toBeVisible();

    // Immutability baseline AFTER first load (post one-time structure scaffold).
    const immutableBefore = await snapshotImmutableTables(e, s.projectId);

    // 4) create a thread
    await page.locator("#new-plot-thread").fill("황태자 암살 음모");
    await page.getByRole("button", { name: "추가" }).click();
    await expect(page.getByText("플롯 스레드를 추가했습니다")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /황태자 암살 음모/ })
    ).toBeVisible();
    {
      const state = await readPlotThreadState(e, s.projectId);
      expect(state.threads.length).toBe(1);
    }

    // 5) edit title + summary
    const newTitle = "황태자 암살 음모 (수정)";
    const newSummary = "궁정 내 배후 세력을 추적하는 핵심 흐름";
    await page.locator("#edit-plot-thread-title").fill(newTitle);
    await page.locator("#edit-plot-thread-summary").fill(newSummary);
    await page.getByRole("button", { name: "제목·설명 저장" }).click();
    await expect(page.getByText("플롯 스레드를 수정했습니다")).toBeVisible();
    {
      const state = await readPlotThreadState(e, s.projectId);
      expect(state.threads[0]?.title).toBe(newTitle);
      expect(state.threads[0]?.summary).toBe(newSummary);
    }

    // 6) link an allowed card (EPISODE). The disallowed CHARACTER_PLAN card must
    //    NOT be offered.
    const cardSelect = page.getByLabel("연결할 구상 카드");
    await expect(cardSelect).toContainText(s.episodeTitle);
    await expect(cardSelect).toContainText(s.sceneTitle);
    await expect(cardSelect).not.toContainText(s.characterPlanTitle);
    await cardSelect.selectOption(s.episodeBlockId);
    await cardSelect.locator("..").getByRole("button", { name: "연결" }).click();
    await expect(page.getByText("구상 카드를 연결했습니다")).toBeVisible();
    {
      const state = await readPlotThreadState(e, s.projectId);
      expect(state.blockLinks.length).toBe(1);
      expect(state.blockLinks[0]?.planning_block_id).toBe(s.episodeBlockId);
    }

    // 7) link a chapter directly (ch1) → summary row manual marker
    const ch1 = s.chapters.find((c) => c.num === 1)!;
    const chapterSelect = page.getByLabel("연결할 회차");
    await chapterSelect.selectOption(ch1.id);
    await chapterSelect
      .locator("..")
      .getByRole("button", { name: "연결" })
      .click();
    await expect(page.getByText("회차를 연결했습니다")).toBeVisible();
    {
      const state = await readPlotThreadState(e, s.projectId);
      expect(state.chapterLinks.length).toBe(1);
      expect(state.chapterLinks[0]?.chapter_id).toBe(ch1.id);
    }

    // 8) matrix distinguishes 작가 연결 vs 원문 근거 vs 작가 연결 · 원문 근거
    const matrix = page.locator("table");
    await expect(
      matrix.getByRole("button", {
        name: `${s.episodeTitle} 2화: 작가 연결 · 원문 근거`,
      })
    ).toBeVisible();
    await expect(
      matrix.getByRole("button", { name: `${s.episodeTitle} 3화: 원문 근거` })
    ).toBeVisible();
    await expect(
      matrix.getByRole("button", { name: "스레드 연결 회차 1화: 작가 연결" })
    ).toBeVisible();
    // Legend shows both author-link and evidence labels.
    await expect(page.getByRole("listitem").filter({ hasText: "작가 연결" }).first()).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "원문 근거" }).first()).toBeVisible();

    // 9) inspector — open the manual+evidence cell (ch2)
    await matrix
      .getByRole("button", { name: `${s.episodeTitle} 2화: 작가 연결 · 원문 근거` })
      .click();
    await expect(
      page.getByRole("heading", { name: "원문 근거 · 작품 기억" })
    ).toBeVisible();
    await expect(page.getByText(`구상 카드 연결: ${s.episodeTitle}`)).toBeVisible();
    await expect(page.getByText("리엔").first()).toBeVisible();
    await expect(page.getByText(`“${s.excerptCh2}”`)).toBeVisible();
    const ch2 = s.chapters.find((c) => c.num === 2)!;
    await expect(
      page.getByRole("link", { name: "원고 회차로 이동" })
    ).toHaveAttribute("href", new RegExp(`write\\?chapter=${ch2.id}`));
    await expect(
      page.getByRole("link", { name: "작품 기억(Codex) 열기" })
    ).toHaveAttribute("href", new RegExp(`/projects/${s.projectId}/codex`));
    await expect(
      page.getByRole("button", { name: "구상 트리에서 보기" })
    ).toBeVisible();

    // ch3 cell surfaces the approved fact source (value + excerpt)
    await matrix
      .getByRole("button", { name: `${s.episodeTitle} 3화: 원문 근거` })
      .click();
    await expect(page.getByText(`리엔 · ${s.factValue}`)).toBeVisible();
    await expect(page.getByText(`“${s.factExcerptCh3}”`)).toBeVisible();

    // 10) unlink the directly-linked chapter and the card
    await page.getByRole("button", { name: "1화 직접 연결 해제" }).click();
    await page.getByRole("button", { name: `${s.episodeTitle} 연결 해제` }).click();
    await expect(
      page.getByText(
        "이 스레드에 연결된 구상 카드가 아직 없습니다. 구상 카드를 연결하면 행으로 표시됩니다."
      )
    ).toBeVisible();
    {
      const state = await readPlotThreadState(e, s.projectId);
      expect(state.blockLinks.length).toBe(0);
      expect(state.chapterLinks.length).toBe(0);
      expect(state.threads.length).toBe(1); // the thread itself remains
    }

    // 11) the whole journey did NOT auto-change planning/manuscript/codex data
    const immutableAfter = await snapshotImmutableTables(e, s.projectId);
    expect(immutableAfter).toBe(immutableBefore);
  });
});
