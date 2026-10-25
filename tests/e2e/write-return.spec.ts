import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Database } from "@/types/database.types";
import { assertLocalSupabaseUrl } from "../integration/helpers/local-supabase";
import {
  cleanupAuthenticatedE2E,
  getAuthE2EEnv,
  seedAuthenticatedE2E,
  type AuthSeed,
} from "./helpers/auth-seed";

const sourceContent = Array.from(
  { length: 120 },
  (_, index) => `${index + 1}번째 집필 문단에서 리엔은 기록을 확인하고 다음 장면을 준비했다. 원래 쓰던 위치를 확인하는 긴 원고다.`
).join("\n\n");
const referenceContent = "리엔은 두 번째 회차에서 오래된 기록을 찾았다.";

async function withWorkspace(
  page: Page,
  run: (fixture: {
    seed: AuthSeed;
    db: ReturnType<typeof createClient<Database>>;
    editor: Locator;
    referenceChapterId: string;
  }) => Promise<void>
) {
  const env = getAuthE2EEnv();
  test.skip(!env.enabled, env.enabled ? "" : env.reason);
  if (!env.enabled) return;
  // Refuse remote writes even when the generic auth helper permits them.
  await assertLocalSupabaseUrl(env.url);
  const db = createClient<Database>(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let seed: AuthSeed | null = null;
  try {
    seed = await seedAuthenticatedE2E();
    if (!seed) throw new Error("Local authenticated seed was not created");
    const source = await db.from("chapters").update({ content: sourceContent }).eq("id", seed.chapterId);
    expect(source.error).toBeNull();
    const reference = await db.from("chapters").insert({
      project_id: seed.projectId,
      chapter_num: 2,
      title: "참조 회차",
      content: referenceContent,
    }).select("id").single();
    expect(reference.error).toBeNull();
    if (!reference.data) throw new Error("Reference chapter was not created");
    const evidence = await db.from("entity_suggestions").insert({
      project_id: seed.projectId,
      chapter_id: reference.data.id,
      matched_entity_id: seed.entityIds.rien,
      name: "리엔",
      type: "CHARACTER",
      summary: "참조 회차의 등장 근거",
      context_snippet: referenceContent,
      confidence: 1,
      status: "CONFIRMED",
      suggested_action: "MERGE",
    });
    expect(evidence.error).toBeNull();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(seed.email);
    await page.getByLabel("비밀번호").fill(seed.password);
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL(/\/projects$/);
    await page.goto(`/projects/${seed.projectId}/write?chapter=${seed.chapterId}`);
    const editor = page.getByRole("textbox", { name: "본문 편집기", exact: true });
    await expect(editor.locator("p")).toHaveCount(120);
    await run({ seed, db, editor, referenceChapterId: reference.data.id });
  } finally {
    await cleanupAuthenticatedE2E(seed);
  }
}

async function selectWritingPosition(page: Page, editor: Locator) {
  await editor.locator("p").nth(25).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(async () => (await readWritingPosition(editor)).selectedText.length).toBe(2);
  // Bring the lookup target into view before recording the viewport. Playwright
  // otherwise scrolls it during click, just as a user would before lookup.
  await editor.locator("p").nth(26).locator("[data-entity-id]").scrollIntoViewIfNeeded();
  const position = await readWritingPosition(editor);
  expect(position.scrollTop).toBeGreaterThan(0);
  return position;
}

async function readWritingPosition(editor: Locator) {
  return editor.evaluate((element) => {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !selection.focusNode) throw new Error("Missing body selection");
    if (!element.contains(selection.anchorNode) || !element.contains(selection.focusNode)) {
      throw new Error("Selection is outside the body");
    }
    const offset = (node: Node, end: number) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      range.setEnd(node, end);
      return range.toString().length;
    };
    const container = element.closest(".write-editor-body");
    if (!container) throw new Error("Missing body scroll container");
    return {
      anchor: offset(selection.anchorNode, selection.anchorOffset),
      focus: offset(selection.focusNode, selection.focusOffset),
      selectedText: selection.toString(),
      scrollTop: container.scrollTop,
    };
  });
}

async function expectRestored(editor: Locator, position: Awaited<ReturnType<typeof readWritingPosition>>) {
  await expect(editor).toBeFocused();
  await expect.poll(async () => {
    const actual = await readWritingPosition(editor);
    return { anchor: actual.anchor, focus: actual.focus, selectedText: actual.selectedText };
  }).toEqual({ anchor: position.anchor, focus: position.focus, selectedText: position.selectedText });
  await expect.poll(async () => Math.abs((await readWritingPosition(editor)).scrollTop - position.scrollTop)).toBeLessThanOrEqual(2);
}

for (const exit of ["return", "close"] as const) {
  test(`entity lookup restores body selection and scroll via ${exit}`, async ({ page }) => {
    await withWorkspace(page, async ({ seed, editor }) => {
      const position = await selectWritingPosition(page, editor);
      // A real pointer click moves the native caret; return must preserve the
      // writing selection from before lookup, rather than the clicked name.
      await editor.locator("p").nth(26).locator(`[data-entity-id="${seed.entityIds.rien}"]`).click();
      const returnButton = page.getByRole("button", { name: "쓰던 자리로 돌아가기", exact: true });
      await expect(returnButton).toBeVisible();
      await expect(page.getByPlaceholder("작품 기억 요약...")).toHaveValue("인증 e2e용 인물");
      await (exit === "return" ? returnButton : page.getByRole("button", { name: "패널 접기", exact: true })).click();
      await expectRestored(editor, position);
      await expect(editor).toHaveText(sourceContent.replaceAll("\n\n", ""));
      await expect(returnButton).toHaveCount(0);
    });
  });

}

test("Codex chapter lookup saves both drafts and restores the source writing position", async ({ page }) => {
  await withWorkspace(page, async ({ seed, db, editor, referenceChapterId }) => {
    await editor.locator("p").nth(25).click();
    await page.keyboard.press("Home");
    await page.keyboard.insertText("집필 중 수정 ");
    const position = await selectWritingPosition(page, editor);
    await editor.locator("p").nth(26).locator(`[data-entity-id="${seed.entityIds.rien}"]`).click();
    await page.getByRole("button", { name: "2화", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "회차 제목" })).toHaveValue("참조 회차");
    await expect(editor).toHaveText(referenceContent);
    await editor.click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" 참조 중 메모.");
    await page.getByRole("button", { name: "쓰던 자리로 돌아가기", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "회차 제목" })).toHaveValue(seed.chapterTitle);
    await expectRestored(editor, position);
    await expect(editor).toContainText("집필 중 수정 ");
    const savedSource = await db.from("chapters").select("content").eq("id", seed.chapterId).single();
    const savedReference = await db.from("chapters").select("content").eq("id", referenceChapterId).single();
    expect(savedSource.error).toBeNull();
    expect(savedReference.error).toBeNull();
    expect(savedSource.data?.content).toContain("집필 중 수정 ");
    expect(savedReference.data?.content).toBe(`${referenceContent} 참조 중 메모.`);
  });
});
