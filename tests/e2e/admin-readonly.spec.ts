import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import type { Database } from "@/types/database.types";
import { assertLocalSupabaseUrl } from "../integration/helpers/local-supabase";
import { getAuthE2EEnv } from "./helpers/auth-seed";

const adminId = "a2000000-0000-4000-8000-000000000001";

test("admin reads complete budget totals and filtered samples without changing data", async ({ page, browser }) => {
  test.setTimeout(60_000);
  const env = getAuthE2EEnv();
  test.skip(!env.enabled, env.enabled ? "" : env.reason);
  if (!env.enabled) return;
  await assertLocalSupabaseUrl(env.url);
  expect(process.env.SMART_WRITER_ADMIN_USER_IDS).toBe(adminId);
  const service = createClient<Database>(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const createdUsers: string[] = [];
  const stamp = randomUUID();
  const password = "SmartWriter-admin-local-1234!";
  const adminEmail = `admin.${stamp}@example.com`;
  const otherEmail = `other.${stamp}@example.com`;
  try {
    for (const input of [{ id: adminId, email: adminEmail }, { id: randomUUID(), email: otherEmail }]) {
      const result = await service.auth.admin.createUser({ ...input, password, email_confirm: true });
      if (result.error) throw result.error;
      createdUsers.push(result.data.user.id);
    }
    const project = await service.from("projects").insert({ user_id: adminId, title: "관리자 검증 작품" })
      .select("id").single();
    if (project.error) throw project.error;
    const foreign = await service.from("projects").insert({ user_id: createdUsers[1], title: "타인 비공개 작품" })
      .select("id").single();
    if (foreign.error) throw foreign.error;
    const chapter = await service.from("chapters").insert({ project_id: project.data.id, chapter_num: 1,
      title: "저장된 원고", content: "관리자 조회로 원고를 바꾸지 않는다." }).select("id,content,updated_at").single();
    if (chapter.error) throw chapter.error;
    const now = new Date().toISOString();
    const rows = [
      ...Array.from({ length: 1502 }, () => ({ project_id: project.data.id, user_id: adminId,
        feature: "embedding", model: "local-admin-fixture", status: "success", cost_usd: 0.001, created_at: now })),
      { project_id: project.data.id, user_id: null, feature: "embedding", model: "local-admin-fixture",
        status: "success", cost_usd: 0.2, created_at: now },
      { project_id: project.data.id, user_id: adminId, feature: "chat", model: "local-admin-fixture",
        status: "error", cost_usd: null, created_at: now },
    ];
    const inserted = await service.from("llm_usage_logs").insert(rows);
    if (inserted.error) throw inserted.error;
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel("이메일").fill(adminEmail);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(/\/projects$/);
    await page.getByRole("link", { name: "AI 운영 현황", exact: true }).click();
    await expect(page.getByRole("heading", { name: "AI 운영 현황" })).toBeVisible();
    await expect(page.getByText("$1.702000", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("$1.502000", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("1,504건", { exact: true })).toBeVisible();
    await expect(page.getByText("local-admin-fixture", { exact: true })).toHaveCount(50);
    await page.getByRole("combobox", { name: "결과", exact: true }).selectOption("error");
    await page.getByRole("button", { name: "조회/새로고침" }).click();
    await expect(page.getByText("local-admin-fixture", { exact: true })).toHaveCount(1);
    await expect(page.getByText("$1.702000", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("smart-writer-admin-readonly.png"), fullPage: true });
    const counts = await service.from("llm_usage_logs").select("id", { count: "exact", head: true }).eq("project_id", project.data.id);
    expect(counts.count).toBe(1504);
    const saved = await service.from("chapters").select("id,content,updated_at").eq("id", chapter.data.id).single();
    expect(saved.data).toEqual(chapter.data);
    const jobs = await service.from("analysis_jobs").select("id").eq("project_id", project.data.id);
    expect(jobs.data).toEqual([]);
    const denied = await page.goto(`/admin?project=${foreign.data.id}`);
    expect(denied?.status()).toBe(404);
    await expect(page.getByText("타인 비공개 작품", { exact: true })).toHaveCount(0);

    const normalContext = await browser.newContext();
    try {
      const normal = await normalContext.newPage();
      await normal.goto("/login");
      await normal.getByLabel("이메일").fill(otherEmail);
      await normal.getByLabel("비밀번호").fill(password);
      await normal.getByRole("button", { name: "로그인", exact: true }).click();
      await normal.waitForURL(/\/projects$/);
      await expect(normal.getByRole("link", { name: "AI 운영 현황", exact: true })).toHaveCount(0);
      const deniedNormal = await normal.goto("/admin");
      expect(deniedNormal?.status()).toBe(404);
    } finally {
      await normalContext.close();
    }
  } finally {
    for (const id of createdUsers) {
      const result = await service.auth.admin.deleteUser(id);
      if (result.error) throw result.error;
    }
  }
});
