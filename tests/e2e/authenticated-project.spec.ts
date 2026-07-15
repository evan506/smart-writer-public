import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  cleanupAuthenticatedE2E,
  getAuthE2EEnv,
  seedAuthenticatedE2E,
  type AuthSeed,
} from "./helpers/auth-seed";

// `test.use({ storageState })` requires a value that's resolvable at module
// load time (it can't read a fixture or await anything), so this can't be
// computed inside `beforeAll`. Playwright restarts the worker process (a
// fresh `process.pid`) on every retry of a failed test -- see
// https://playwright.dev/docs/test-retries -- so keying the path on
// `process.pid` here gives every worker attempt, including CI retries, its
// own storage state file with no cross-worker collisions, while still being
// a value fixed at module evaluation time.
const STORAGE_STATE_PATH = path.join(
  os.tmpdir(),
  `sw-auth-e2e-${process.pid}.json`
);

let seed: AuthSeed | null = null;

test.describe("authenticated project flow", () => {
  test.use({ storageState: STORAGE_STATE_PATH });

  test.beforeAll(async ({ browser }, testInfo) => {
    // Write a valid (unauthenticated) storage state FIRST, unconditionally:
    // `test.use({ storageState })` needs this file to exist for every test's
    // context creation, and any throw later in this hook (login timeout,
    // seed failure) must surface as its own error — not as an ENOENT while
    // reading the storage state (CI run 29137196012 failure mode).
    await mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true });
    await writeFile(
      STORAGE_STATE_PATH,
      JSON.stringify({ cookies: [], origins: [] })
    );

    const env = getAuthE2EEnv();
    if (!env.enabled) {
      return;
    }

    // `seedAuthenticatedE2E` creates a brand-new user/project/chapter on
    // every call (email/title are stamped with `Date.now()` in
    // helpers/auth-seed.ts), so each worker process -- including a fresh
    // worker spawned for a CI retry -- gets fully independent seed data.
    // That's what makes retries "work" today; this refactor preserves it by
    // still calling seedAuthenticatedE2E() once per beforeAll.
    seed = await seedAuthenticatedE2E();
    if (!seed) {
      // Shouldn't happen when env.enabled is true; the empty state written
      // above keeps context creation working while tests `test.skip`.
      return;
    }

    // Log in once per worker and persist the authenticated session, instead
    // of driving the login form from every test (x up to 3 attempts each
    // under CI's retries: 2). That per-test-login pattern was hitting
    // /login repeatedly without ever navigating away -- most likely
    // Supabase auth rate limiting or a navigation race -- which is the
    // dominant flake source in this spec.
    // browser.newContext() does NOT inherit the config's `use` options —
    // without an explicit baseURL the relative goto("/login") throws before
    // the authenticated state is ever written.
    const baseURL =
      testInfo.project.use.baseURL ?? "http://127.0.0.1:3100";
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("이메일").fill(seed.email);
    await page.getByLabel("비밀번호").fill(seed.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await page.waitForURL(/\/projects$/);
    await context.storageState({ path: STORAGE_STATE_PATH });
    await context.close();
  });

  test.afterAll(async () => {
    await cleanupAuthenticatedE2E(seed);
  });

  test("logs in and opens the seeded write workspace", async ({ page }) => {
    const env = getAuthE2EEnv();
    test.skip(!env.enabled, env.enabled ? "" : env.reason);
    test.skip(!seed, "authenticated e2e seed was not created");

    await page.goto("/projects");

    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText(seed!.email)).toBeVisible();
    await expect(page.getByText(seed!.projectTitle)).toBeVisible();
    await expect(page.getByText("1").first()).toBeVisible();
    await expect(page.getByText("챕터")).toBeVisible();
    await expect(page.getByText("설정")).toBeVisible();

    // Click the card link (not a bare text node) — text-node clicks
    // intermittently missed the navigation in CI (run 29137365786 flake).
    const projectCard = page.getByRole("link", {
      name: new RegExp(seed!.projectTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    });
    await expect(projectCard).toBeVisible();
    await projectCard.click();
    await expect(page).toHaveURL(new RegExp(`/projects/${seed!.projectId}/write`));
    await expect(page).toHaveURL(new RegExp(`chapter=${seed!.chapterId}`));
    await expect(page.getByText(seed!.projectTitle)).toBeVisible();
    await expect(page.getByText(seed!.chapterTitle)).toBeVisible();
    await expect(page.getByText("리엔은 검은 서고")).toBeVisible();
  });

  test("persists draft edits in the write workspace", async ({ page }) => {
    const env = getAuthE2EEnv();
    test.skip(!env.enabled, env.enabled ? "" : env.reason);
    test.skip(!seed, "authenticated e2e seed was not created");

    await page.goto(`/projects/${seed!.projectId}/write?chapter=${seed!.chapterId}`);

    // Guard against the hydration race: the title/body inputs can briefly be
    // empty right after navigation before client data finishes loading. This
    // only waits for *some* content to have hydrated (state-independent),
    // not for a specific previously-tracked value, since another worker's
    // retry of an earlier test can leave the DB row in an arbitrary prior
    // state.
    await expect(page.getByPlaceholder("제목 입력...")).not.toHaveValue("", {
      timeout: 15_000,
    });
    await expect(page.locator(".ProseMirror")).not.toHaveText("", {
      timeout: 15_000,
    });

    const title = `두 번째 장면 ${Date.now()}`;
    const body = "새벽의 감시탑에서 리엔은 두 번째 단서를 기록했다.";

    await page.getByPlaceholder("제목 입력...").fill(title);
    await page.locator(".ProseMirror").fill(body);

    await expect(page.getByText(body)).toBeVisible();
    await page.waitForTimeout(3_500);
    await expect(page.getByText("저장됨")).toBeVisible({ timeout: 7_000 });

    await page.reload();

    await expect(page.getByPlaceholder("제목 입력...")).toHaveValue(title);
    await expect(page.getByText(body)).toBeVisible();
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("preserves draft content when switching between chapters", async ({ page }) => {
    const env = getAuthE2EEnv();
    test.skip(!env.enabled, env.enabled ? "" : env.reason);
    test.skip(!seed, "authenticated e2e seed was not created");

    await page.goto(`/projects/${seed!.projectId}/write?chapter=${seed!.chapterId}`);

    // Guard against the hydration race (see previous test).
    await expect(page.getByPlaceholder("제목 입력...")).not.toHaveValue("", {
      timeout: 15_000,
    });
    await expect(page.locator(".ProseMirror")).not.toHaveText("", {
      timeout: 15_000,
    });

    const chapterOneTitle = `자칭 마왕을 주웠다 (1) ${Date.now()}`;
    const chapterOneBody =
      "나엔은 숲길에서 쓰러진 낯선 아이를 발견했다. 아이는 자신을 마왕이라고 말했다.";
    await page.getByPlaceholder("제목 입력...").fill(chapterOneTitle);
    await page.locator(".ProseMirror").fill(chapterOneBody);
    await expect(page.getByText(chapterOneBody)).toBeVisible();

    await page.getByRole("button", { name: "새 챕터 만들기" }).click();
    await expect(page.getByPlaceholder("제목 입력...")).toHaveValue("");

    const chapterTwoTitle = `자칭 마왕을 주웠다 (2) ${Date.now()}`;
    const chapterTwoBody =
      "리켈은 작은 손으로 낡은 망토를 움켜쥐고, 자신이 잃어버린 왕국을 되찾겠다고 말했다.";
    await page.getByPlaceholder("제목 입력...").fill(chapterTwoTitle);
    await page.locator(".ProseMirror").fill(chapterTwoBody);
    await expect(page.getByText(chapterTwoBody)).toBeVisible();

    const escapedChapterOneTitle = chapterOneTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedChapterTwoTitle = chapterTwoTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    await page.getByRole("button", { name: new RegExp(escapedChapterOneTitle) }).click();
    await expect(page.getByPlaceholder("제목 입력...")).toHaveValue(chapterOneTitle);
    await expect(page.getByText(chapterOneBody)).toBeVisible();

    await page.getByRole("button", { name: new RegExp(escapedChapterTwoTitle) }).click();
    await expect(page.getByPlaceholder("제목 입력...")).toHaveValue(chapterTwoTitle);
    await expect(page.getByText(chapterTwoBody)).toBeVisible();

    await page.reload();
    await expect(page.getByPlaceholder("제목 입력...")).toHaveValue(chapterTwoTitle);
    await expect(page.getByText(chapterTwoBody)).toBeVisible();
  });

  test("renders entity underlines and graph filter states in the write workspace", async ({ page }) => {
    const env = getAuthE2EEnv();
    test.skip(!env.enabled, env.enabled ? "" : env.reason);
    test.skip(!seed, "authenticated e2e seed was not created");

    await page.goto(`/projects/${seed!.projectId}/write?chapter=${seed!.chapterId}`);

    // Guard against the hydration race (see earlier tests).
    await expect(page.getByPlaceholder("제목 입력...")).not.toHaveValue("", {
      timeout: 15_000,
    });
    await expect(page.locator(".ProseMirror")).not.toHaveText("", {
      timeout: 15_000,
    });

    const editor = page.locator(".ProseMirror");
    await editor.fill(seed!.chapterContent);
    await expect(editor).toContainText("리엔은 검은 서고");

    const rienUnderline = editor.locator(
      `[data-entity-id="${seed!.entityIds.rien}"][data-entity-match="리엔"]`
    );
    const aliasUnderline = editor.locator(
      `[data-entity-id="${seed!.entityIds.rien}"][data-entity-match="렌"]`
    );
    await expect(rienUnderline).toHaveCount(1);
    await expect(aliasUnderline).toHaveCount(1);
    await expect(rienUnderline).toHaveAttribute("data-entity-selected", "false");
    await expect(aliasUnderline).toHaveAttribute("data-entity-selected", "false");

    await page.getByRole("button", { name: "사전" }).click();
    await page.getByPlaceholder("인물, 장소, 설정 검색...").fill("리엔");
    await page.getByRole("button", { name: /리엔/ }).click();
    await expect(rienUnderline).toHaveAttribute("data-entity-selected", "true");
    await expect(aliasUnderline).toHaveAttribute("data-entity-selected", "true");

    await page.getByRole("button", { name: /관계 미리보기/ }).click();
    const graphModal = page.locator(".fixed.inset-0").filter({ hasText: "관계 미리보기" });
    await expect(graphModal.getByText("관계 미리보기").first()).toBeVisible();
    await expect(graphModal.getByText("선택: 리엔")).toBeVisible();
    await expect(graphModal.getByText("동맹")).toBeVisible();

    await graphModal.getByRole("button", { name: /동맹/ }).click();
    await graphModal.getByRole("button", { name: /장소/ }).click();
    await expect(graphModal.getByText("필터에 맞는 항목이 없습니다.")).toBeVisible();
    // With both a relation-type filter ("동맹") and an entity-type filter
    // ("장소") active, the modal also renders "분류 필터 해제" and "관계 필터
    // 해제" buttons alongside the combined "필터 해제" reset button. Playwright's
    // default (non-exact) role-name matching is substring-based, so all three
    // would match { name: "필터 해제" } and cause a strict-mode violation —
    // require an exact match to target only the combined reset button.
    await expect(
      graphModal.getByRole("button", { name: "필터 해제", exact: true })
    ).toBeVisible();

    await graphModal.getByRole("button", { name: "필터 해제", exact: true }).click();
    await expect(graphModal.getByText("필터에 맞는 항목이 없습니다.")).toBeHidden();
    await expect(graphModal.getByText("선택: 리엔")).toBeVisible();
  });

  test("confirms source-backed suggestions into Codex, search, and relationship preview", async ({ page }) => {
    const env = getAuthE2EEnv();
    test.skip(!env.enabled, env.enabled ? "" : env.reason);
    test.skip(!seed, "authenticated e2e seed was not created");

    await page.goto(`/projects/${seed!.projectId}/write?chapter=${seed!.chapterId}`);

    // Guard against the hydration race (see earlier tests). This test
    // doesn't fill the editor itself, but the previous test in this worker
    // leaves the chapter body populated with the full seed sentence
    // (including this test's fact evidence text as a substring), so waiting
    // for hydration before interacting keeps this test's behavior
    // independent of exactly when that write lands.
    await expect(page.getByPlaceholder("제목 입력...")).not.toHaveValue("", {
      timeout: 15_000,
    });
    await expect(page.locator(".ProseMirror")).not.toHaveText("", {
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByText("검토할 설정 후보 (1)")).toBeVisible();
    await expect(page.getByText("푸른 문", { exact: true })).toBeVisible();
    await expect(page.getByText("원문 근거 · 작가 판단 기준").first()).toBeVisible();
    await expect(page.getByText("‘푸른 문은 다음 장면의 단서로 등장했다.’")).toBeVisible();
    await expect(page.getByText("검토할 세부 설정 (1)")).toBeVisible();
    await expect(page.getByText("검은 관리자에게 비밀을 숨기고 있다")).toBeVisible();
    // The fact's evidence_text ("렌은 검은 관리자에게 비밀을 숨겼다.") is a
    // verbatim substring of the chapter body, which is simultaneously live
    // in the .ProseMirror editor on this same page (the previous test wrote
    // the full seed sentence back into it). getByText() substring-matches
    // both the editor paragraph and the suggestion <blockquote>
    // (fact-suggestion-list.tsx), causing a strict-mode violation. Scope to
    // the <blockquote> the evidence text actually renders in so this stays
    // unique regardless of what's currently in the editor.
    await expect(
      page.locator("blockquote").filter({ hasText: "렌은 검은 관리자에게 비밀을 숨겼다." })
    ).toBeVisible();

    await page.getByRole("button", { name: /작가 승인으로 기억/ }).click();
    await expect(page.getByText("작품 기억에 저장했습니다")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("검토할 설정 후보 (1)")).toBeHidden({ timeout: 10_000 });

    await expect(page.getByText("검토할 관계 후보 (1)")).toBeVisible();
    await expect(page.getByText("리엔 → 검은 서고")).toBeVisible();
    await expect(page.getByText("‘리엔은 검은 서고에서 오래된 단서를 발견했다.’")).toBeVisible();

    await page.getByRole("button", { name: /관계 후보 승인/ }).click();
    await expect(page.getByText("작품 기억에 저장했습니다")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("검토할 관계 후보 (1)")).toBeHidden({ timeout: 10_000 });

    // Single-item approve button's accessible name comes from an explicit
    // aria-label ("설정으로 저장" for a first-time, non-conflicting approval),
    // not the inner visible span text ("저장"). See fact-suggestion-list.tsx.
    await page.getByRole("button", { name: "설정으로 저장" }).click();
    await expect(page.getByText("세부 설정을 작품 기억에 저장했습니다")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("검토할 세부 설정 (1)")).toBeHidden({ timeout: 10_000 });

    await page.getByRole("button", { name: "사전" }).click();
    await page.getByPlaceholder("인물, 장소, 설정 검색...").fill("푸른 문");
    await expect(page.getByRole("button", { name: /푸른 문/ })).toBeVisible();

    await page.getByPlaceholder("인물, 장소, 설정 검색...").fill("리엔");
    await page.getByRole("button", { name: /리엔/ }).click();
    await expect(page.getByText("검은 서고").first()).toBeVisible();
    await expect(page.getByText("위치").first()).toBeVisible();
    await expect(page.getByText("승인된 설정")).toBeVisible();
    await expect(page.getByText("검은 관리자에게 비밀을 숨기고 있다")).toBeVisible();
    // formatFactSourceLabel() always includes the chapter title when present
    // (facts-section.tsx), so the evidence label reads "1화 · <title> 근거".
    // The chapter's title has been overwritten by earlier tests in this
    // worker (and a retry in a fresh worker starts from a fresh seed with
    // its own title), so match the shape of the label instead of a specific
    // title value.
    // Two approved facts render this label format by this point — assert
    // the format exists rather than uniqueness.
    await expect(page.getByText(/1화 · .* 근거/).first()).toBeVisible();

    await page.getByRole("button", { name: /관계 미리보기/ }).click();
    const graphModal = page.locator(".fixed.inset-0").filter({ hasText: "관계 미리보기" });
    await expect(graphModal.getByText("관계 미리보기").first()).toBeVisible();
    await expect(graphModal.getByText("선택: 리엔")).toBeVisible();
    await expect(graphModal.getByText("검은 서고").first()).toBeVisible();
    await expect(graphModal.getByText("위치").first()).toBeVisible();

    await page.goto(`/projects/${seed!.projectId}/search`);
    await page
      .getByPlaceholder("인물, 장소, 사건, 대사를 작품 안에서 찾아보세요")
      .fill("푸른 문");
    await page.getByRole("button", { name: "검색" }).click();
    await expect(page.getByText(/“푸른 문” 관련 인물, 설정, 본문을 찾았습니다/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("link", { name: "푸른 문" })).toBeVisible();
    await expect(page.getByText("작품 기억").last()).toBeVisible();
  });
});
