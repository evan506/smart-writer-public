import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@/types/database.types";
import { assertLocalSupabaseUrl } from "../integration/helpers/local-supabase";
import {
  cleanupAuthenticatedE2E,
  getAuthE2EEnv,
  seedAuthenticatedE2E,
  type AuthSeed,
} from "./helpers/auth-seed";

test("keeps draft and full saves successful while AI is over budget", async ({ page }) => {
  const env = getAuthE2EEnv();
  test.skip(!env.enabled, env.enabled ? "" : env.reason);
  if (!env.enabled) return;
  // This fixture always refuses remote writes, even if the generic E2E helper
  // has been explicitly permitted to use a remote test environment.
  await assertLocalSupabaseUrl(env.url);
  expect(process.env.SMART_WRITER_LLM_MONTHLY_BUDGET_USD).toBe("0.1");
  const service = createClient<Database>(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let seed: AuthSeed | null = null;
  try {
    seed = await seedAuthenticatedE2E();
    expect(seed).not.toBeNull();
    if (!seed) return;
    const { error: seedError } = await service.from("llm_usage_logs").insert({
      project_id: seed.projectId, user_id: seed.userId,
      cost_usd: 0.2, feature: "embedding", model: "no-paid-ai", status: "success",
    });
    if (seedError) throw seedError;

    await page.goto("/login");
    await page.getByLabel("이메일").fill(seed.email);
    await page.getByLabel("비밀번호").fill(seed.password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(/\/projects$/);
    await page.goto(`/projects/${seed.projectId}/write?chapter=${seed.chapterId}`);
    const editor = page.getByRole("textbox", { name: "본문 편집기", exact: true });
    await expect(editor).not.toHaveText("", { timeout: 15_000 });
    const body = "AI 한도가 차 있어도 리엔의 원고는 안전하게 저장된다.";
    await editor.fill(body);
    await expect(page.getByRole("status")).toContainText("변경 있음 · 저장 대기");
    await expect(page.getByRole("status")).toContainText("저장됨", { timeout: 10_000 });

    // Draft autosave does not request analysis. Explicit save does, so the
    // budget warning belongs to this second save while manuscript success stays.
    await page.getByRole("button", { name: "저장하고 기억 정리", exact: true }).click();
    await expect(page.getByText(
      "AI 사용 한도에 도달해 자동 분석이 일시 중지되었습니다. 원고는 정상적으로 저장되었습니다.",
      { exact: true },
    )).toBeVisible();
    await expect(page.getByRole("status")).toContainText("저장됨");

    const persisted = await service.from("chapters").select("content")
      .eq("id", seed.chapterId).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data?.content).toBe(body);
    const usage = await service.from("llm_usage_logs")
      .select("id", { count: "exact", head: true }).eq("project_id", seed.projectId);
    expect(usage.error).toBeNull();
    expect(usage.count).toBe(1);
    const jobs = await service.from("analysis_jobs")
      .select("id").eq("project_id", seed.projectId);
    expect(jobs.error).toBeNull();
    expect(jobs.data).toEqual([]);
    await page.reload();
    await expect(editor).toHaveText(body);
  } finally {
    await cleanupAuthenticatedE2E(seed);
  }
});
