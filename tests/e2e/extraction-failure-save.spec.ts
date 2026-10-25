import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@/types/database.types";
import { assertLocalSupabaseUrl } from "../integration/helpers/local-supabase";
import { cleanupAuthenticatedE2E, getAuthE2EEnv, seedAuthenticatedE2E, type AuthSeed } from "./helpers/auth-seed";

test("malformed analysis keeps the saved manuscript, canon, and partial candidates after reload", async ({ page }) => {
  test.setTimeout(90_000);
  const env = getAuthE2EEnv();
  test.skip(!env.enabled || process.env.SMART_WRITER_EXTRACTION_FAILURE_E2E !== "1", "Requires local Supabase and the mock provider preload");
  if (!env.enabled) return;
  await assertLocalSupabaseUrl(env.url);
  expect(process.env.NODE_OPTIONS).toContain("mock-extraction-provider.cjs");
  expect(process.env.OPENROUTER_API_KEY).toBe("local-extraction-no-paid-ai");
  expect(process.env.SMART_WRITER_SKIP_EMBEDDINGS).toBe("1");
  const service = createClient<Database>(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let seed: AuthSeed | null = null;
  try {
    seed = await seedAuthenticatedE2E();
    expect(seed).not.toBeNull();
    if (!seed) return;
    const canonBefore = await service.from("entities").select("*").eq("project_id", seed.projectId).order("id");
    const linksBefore = await service.from("entity_links").select("*").in("from_id", Object.values(seed.entityIds)).order("id");
    expect(canonBefore.error).toBeNull();
    expect(linksBefore.error).toBeNull();

    await page.goto("/login");
    await page.getByLabel("이메일").fill(seed.email);
    await page.getByLabel("비밀번호").fill(seed.password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(/\/projects$/);
    await page.goto(`/projects/${seed.projectId}/write?chapter=${seed.chapterId}`);
    const editor = page.getByRole("textbox", { name: "본문 편집기", exact: true });
    await expect(editor).not.toHaveText("", { timeout: 15_000 });
    const body = "실패검증인물은 기억 정리가 실패해도 원고에 그대로 남는다.";
    await editor.fill(body);
    await page.getByRole("button", { name: "저장하고 기억 정리", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "저장됨" })).toBeVisible();
    await expect.poll(async () => {
      const jobs = await service.from("analysis_jobs").select("status,error")
        .eq("chapter_id", seed!.chapterId).order("created_at", { ascending: false }).limit(1);
      expect(jobs.error).toBeNull();
      return jobs.data?.[0];
    }, { timeout: 30_000 }).toMatchObject({ status: "FAILED", error: expect.stringContaining("stage2") });

    const warning = page.getByRole("main").getByText("원고는 저장됐습니다. 기억 정리를 끝내지 못했습니다.", { exact: true });
    await expect(warning).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("표시된 후보는 일부일 수 있습니다. 원문 근거를 확인해 주세요.", { exact: true })).toBeVisible();
    await expect(page.getByText("푸른 문", { exact: true }).first()).toBeVisible();
    const persisted = await service.from("chapters").select("content").eq("id", seed.chapterId).single();
    expect(persisted.error).toBeNull();
    expect(persisted.data?.content).toBe(body);
    const canonAfter = await service.from("entities").select("*").eq("project_id", seed.projectId).order("id");
    const linksAfter = await service.from("entity_links").select("*").in("from_id", Object.values(seed.entityIds)).order("id");
    expect(canonAfter.error).toBeNull();
    expect(linksAfter.error).toBeNull();
    expect(canonAfter.data).toEqual(canonBefore.data);
    expect(linksAfter.data).toEqual(linksBefore.data);
    const usage = await service.from("llm_usage_logs").select("status,cost_usd,user_id").eq("project_id", seed.projectId);
    expect(usage.error).toBeNull();
    expect(usage.data).toHaveLength(2);
    expect(usage.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "success", cost_usd: 0, user_id: seed.userId }),
    ]));
    await page.reload();
    await expect(editor).toHaveText(body);
    await expect(warning).toBeVisible();
    await expect(page.getByText("푸른 문", { exact: true }).first()).toBeVisible();
  } finally {
    await cleanupAuthenticatedE2E(seed);
  }
});
