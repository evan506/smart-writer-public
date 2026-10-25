import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { assertLocalSupabaseUrl } from "../integration/helpers/local-supabase";
import { cleanupAuthenticatedE2E, getAuthE2EEnv, seedAuthenticatedE2E, type AuthSeed } from "./helpers/auth-seed";

// Requires the local authenticated test DB; never falls back to remote data.
test("PC counts, registration checks and line-break highlights survive real saves", async ({ page }) => {
  const env = getAuthE2EEnv();
  test.skip(!env.enabled, env.enabled ? "" : env.reason);
  if (!env.enabled) return;
  await assertLocalSupabaseUrl(env.url);
  const db = createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  let seed: AuthSeed | null = null;
  try {
    seed = await seedAuthenticatedE2E();
    if (!seed) throw new Error("Local authenticated seed was not created");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(seed.email);
    await page.getByLabel("비밀번호").fill(seed.password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(/\/projects$/);
    await page.goto(`/projects/${seed.projectId}/write?chapter=${seed.chapterId}`);
    const editor = page.getByRole("textbox", { name: "본문 편집기", exact: true });
    await expect(editor).not.toHaveText("");
    const title = page.getByRole("textbox", { name: "회차 제목" });
    await title.fill("PC 검증 회차");
    await editor.fill("리엔 은, 검!");
    const count = page.getByRole("group", { name: "선택 기준 글자 수" });
    await expect(count).toHaveText("공백 포함 8자");
    await page.getByRole("button", { name: "노벨피아", exact: true }).click();
    await expect(count).toHaveText("노벨피아 참고 4자");
    await page.getByRole("button", { name: "문피아", exact: true }).click();
    await expect(count).toHaveText("문피아 참고 6자");
    await expect(page.getByRole("status")).toContainText("저장됨", { timeout: 10_000 });
    const saved = await db.from("chapters").select("content,title").eq("id", seed.chapterId).single();
    expect(saved.error).toBeNull();
    expect(saved.data).toEqual({ content: "리엔 은, 검!", title: "PC 검증 회차" });

    await page.getByRole("button", { name: "기억 등록 상태 점검", exact: true }).click();
    await expect(page.getByText("기억 등록 상태 점검 결과", { exact: true })).toBeVisible();
    await expect(page.getByText(/현재 입력 내용이나 이야기의 의미적 모순을 검사하지 않습니다/)).toBeVisible();
    await page.getByRole("button", { name: "새 챕터 만들기", exact: true }).click();
    await expect(title).toHaveValue("");
    await expect(page.getByText("기억 등록 상태 점검 결과", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: /PC 검증 회차/ }).click();
    await expect(title).toHaveValue("PC 검증 회차");
    await expect(editor).toHaveText("리엔 은, 검!");

    await editor.fill("리");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.insertText("엔");
    const highlight = editor.locator(`[data-entity-id="${seed.entityIds.rien}"]`);
    await expect(highlight).toHaveCount(0);
    await editor.fill("다른");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.insertText("리엔");
    await expect(highlight).toHaveCount(1);
    await expect(highlight).toHaveText("리엔");
    await expect(highlight.locator("br")).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText("저장됨", { timeout: 10_000 });
    const final = await db.from("chapters").select("content").eq("id", seed.chapterId).single();
    expect(final.error).toBeNull();
    expect(final.data?.content).toBe("다른\n리엔");
    await page.reload();
    await expect(editor).toContainText("다른");
    await expect(highlight).toHaveText("리엔");
  } finally {
    await cleanupAuthenticatedE2E(seed);
  }
});
