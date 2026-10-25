import { expect, test as base, type Page } from "@playwright/test";
import {
  cleanupAuthenticatedE2E,
  getAuthE2EEnv,
  seedAuthenticatedE2E,
  type AuthSeed,
} from "./helpers/auth-seed";

type AuthSession = {
  seed: AuthSeed | null;
  storageState: Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>;
};

// Worker retries get their own account. Fixture teardown runs even if login or
// a test fails; seedAuthenticatedE2E also cleans partially created data.
const test = base.extend<{ seed: AuthSeed | null }, { authSession: AuthSession }>({
  authSession: [async ({ browser }, runFixture, workerInfo) => {
    const seed = await seedAuthenticatedE2E();
    try {
      if (!seed) {
        await runFixture({ seed, storageState: { cookies: [], origins: [] } });
        return;
      }
      const context = await browser.newContext({
        baseURL: workerInfo.project.use.baseURL ?? "http://127.0.0.1:3100",
      });
      let storageState: AuthSession["storageState"];
      try {
        const page = await context.newPage();
        await page.goto("/login");
        await page.getByLabel("이메일").fill(seed.email);
        await page.getByLabel("비밀번호").fill(seed.password);
        await page.getByRole("button", { name: "로그인" }).click();
        await page.waitForURL(/\/projects$/);
        storageState = await context.storageState();
      } finally {
        await context.close();
      }
      await runFixture({ seed, storageState });
    } finally {
      await cleanupAuthenticatedE2E(seed);
    }
  }, { scope: "worker" }],
  seed: async ({ authSession }, runFixture) => {
    await runFixture(authSession.seed);
  },
  storageState: async ({ authSession }, runFixture) => {
    await runFixture(authSession.storageState);
  },
});

async function prepareNavigationChapters(page: Page, seed: AuthSeed) {
  await page.goto(`/projects/${seed.projectId}/write?chapter=${seed.chapterId}`);
  const titleInput = page.getByPlaceholder("제목 입력...");
  await expect(titleInput).not.toHaveValue("");
  const stamp = Date.now();
  const source = { id: seed.chapterId, title: `이동 출발 ${stamp}` };
  await titleInput.fill(source.title);
  const targets: { id: string; title: string }[] = [];
  for (const name of ["이동 중간", "이동 도착"]) {
    await page.getByRole("button", { name: "새 챕터 만들기", exact: true }).click();
    await expect(titleInput).toHaveValue("");
    const target = { id: new URL(page.url()).searchParams.get("chapter")!, title: `${name} ${stamp}` };
    await titleInput.fill(target.title);
    await expect(titleInput).toHaveValue(target.title);
    await expect(page.getByRole("button", { name: new RegExp(target.title) })).toBeVisible();
    targets.push(target);
  }
  // Clicking away must persist the exact newly typed title before activation.
  const last = targets[targets.length - 1];
  const savedTarget = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.ok() &&
    Boolean(response.request().postData()?.includes(last.id) && response.request().postData()?.includes(last.title))
  );
  await page.getByRole("button", { name: new RegExp(source.title) }).click();
  await savedTarget;
  await expect(page.getByRole("button", { name: new RegExp(last.title) })).toBeVisible();
  await expect(titleInput).toHaveValue(source.title);
  await expect(page).toHaveURL(new RegExp(`chapter=${source.id}`));
  return { source, middle: targets[0], last: targets[1] };
}

test.describe("authenticated project flow", () => {
  test("logs in and opens the seeded write workspace", async ({ page, seed }) => {
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

  test("persists draft edits in the write workspace", async ({ page, seed }) => {
    const env = getAuthE2EEnv();
    test.skip(!env.enabled, env.enabled ? "" : env.reason);
    test.skip(!seed, "authenticated e2e seed was not created");

    await page.goto(`/projects/${seed!.projectId}/write?chapter=${seed!.chapterId}`);

    // Guard against the hydration race: the title/body inputs can briefly be
    // empty right after navigation before client data finishes loading. This
    // only waits for *some* content to have hydrated (state-independent),
    // not for a specific previously-tracked value, since earlier tests in
    // this worker may already have edited its shared chapter.
    await expect(page.getByPlaceholder("제목 입력...")).not.toHaveValue("", {
      timeout: 15_000,
    });
    await expect(page.getByRole("textbox", { name: "본문 편집기", exact: true })).not.toHaveText("", {
      timeout: 15_000,
    });

    const title = `두 번째 장면 ${Date.now()}`;
    const body = "새벽의 감시탑에서 리엔은 두 번째 단서를 기록했다.";

    const saved = page.waitForResponse((response) => {
      const request = response.request();
      return request.method() === "POST" &&
        new URL(response.url()).pathname === `/projects/${seed!.projectId}/write` &&
        Boolean(request.headers()["next-action"]) &&
        Boolean(request.postData()?.includes(body));
    });
    await page.getByPlaceholder("제목 입력...").fill(title);
    await page.getByRole("textbox", { name: "본문 편집기", exact: true }).fill(body);

    await expect(page.getByRole("textbox", { name: "본문 편집기", exact: true })).toHaveText(body);
    await expect(page.getByRole("status")).toContainText("변경 있음 · 저장 대기");
    expect((await saved).ok()).toBe(true);
    await expect(page.getByText("저장됨")).toBeVisible({ timeout: 7_000 });

    await page.reload();

    await expect(page.getByPlaceholder("제목 입력...")).toHaveValue(title);
    await expect(page.getByRole("textbox", { name: "본문 편집기", exact: true })).toHaveText(body);
    await expect(page.getByText(title).first()).toBeVisible();
  });

  test("preserves draft content when switching between chapters", async ({ page, seed }) => {
    const env = getAuthE2EEnv();
    test.skip(!env.enabled, env.enabled ? "" : env.reason);
    test.skip(!seed, "authenticated e2e seed was not created");

    await page.goto(`/projects/${seed!.projectId}/write?chapter=${seed!.chapterId}`);

    // Guard against the hydration race (see previous test).
    await expect(page.getByPlaceholder("제목 입력...")).not.toHaveValue("", {
      timeout: 15_000,
    });
    await expect(page.getByRole("textbox", { name: "본문 편집기", exact: true })).not.toHaveText("", {
      timeout: 15_000,
    });

    const chapterOneTitle = `자칭 마왕을 주웠다 (1) ${Date.now()}`;
    const chapterOneBody =
      "나엔은 숲길에서 쓰러진 낯선 아이를 발견했다. 아이는 자신을 마왕이라고 말했다.";
    await page.getByPlaceholder("제목 입력...").fill(chapterOneTitle);
    await page.getByRole("textbox", { name: "본문 편집기", exact: true }).fill(chapterOneBody);
    await expect(page.getByText(chapterOneBody)).toBeVisible();

    await page.getByRole("button", { name: "새 챕터 만들기" }).click();
    await expect(page.getByPlaceholder("제목 입력...")).toHaveValue("");

    const chapterTwoTitle = `자칭 마왕을 주웠다 (2) ${Date.now()}`;
    const chapterTwoBody =
      "세란은 작은 손으로 낡은 망토를 움켜쥐고, 자신이 잃어버린 왕국을 되찾겠다고 말했다.";
    await page.getByPlaceholder("제목 입력...").fill(chapterTwoTitle);
    await page.getByRole("textbox", { name: "본문 편집기", exact: true }).fill(chapterTwoBody);
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

  test("renders entity underlines and graph filter states in the write workspace", async ({ page, seed }) => {
    const env = getAuthE2EEnv();
    test.skip(!env.enabled, env.enabled ? "" : env.reason);
    test.skip(!seed, "authenticated e2e seed was not created");

    await page.goto(`/projects/${seed!.projectId}/write?chapter=${seed!.chapterId}`);

    // Guard against the hydration race (see earlier tests).
    await expect(page.getByPlaceholder("제목 입력...")).not.toHaveValue("", {
      timeout: 15_000,
    });
    await expect(page.getByRole("textbox", { name: "본문 편집기", exact: true })).not.toHaveText("", {
      timeout: 15_000,
    });

    const editor = page.getByRole("textbox", { name: "본문 편집기", exact: true });
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

  test("confirms source-backed suggestions into Codex, search, and relationship preview", async ({ page, seed }) => {
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
    await expect(page.getByRole("textbox", { name: "본문 편집기", exact: true })).not.toHaveText("", {
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
    // in the body editor on this same page (the previous test wrote
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

  test("creates only one chapter during slow repeated clicks", async ({ page, seed }) => {
    test.skip(!seed, "authenticated e2e seed was not created");
    await page.goto(`/projects/${seed!.projectId}/write?chapter=${seed!.chapterId}`);
    await expect(page.getByRole("textbox", { name: "본문 편집기" })).not.toHaveText("");
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let createRequests = 0;
    await page.route("**/write*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.postData()?.includes("requestId")) {
        createRequests++;
        await held;
      }
      await route.continue();
    });
    try {
      const createButton = page.getByRole("button", { name: "새 챕터 만들기", exact: true });
      await createButton.evaluate((button: HTMLButtonElement) => {
        button.click();
        button.click();
      });
      await expect.poll(() => createRequests).toBe(1);
      await expect(createButton).toBeDisabled();
      await expect(page).toHaveURL(new RegExp(`chapter=${seed!.chapterId}`));
      release();
      await expect(page).not.toHaveURL(new RegExp(`chapter=${seed!.chapterId}`));
      await expect(page.getByPlaceholder("제목 입력...")).toHaveValue("");
      await expect(createButton).toBeEnabled();
      expect(createRequests).toBe(1);
    } finally {
      release();
    }
  });


  test("keeps the pinned draft while saving and opens the last clicked chapter", async ({ page, seed }) => {
    test.skip(!seed, "authenticated e2e seed was not created");
    const { source, middle, last } = await prepareNavigationChapters(page, seed!);
    const body = `느린 저장 중에도 지켜야 할 한글 원고 ${Date.now()}`;
    const editor = page.getByRole("textbox", { name: "본문 편집기" });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let saves = 0;
    await page.route("**/write*", async (route) => {
      if (route.request().method() === "POST" && route.request().postData()?.includes(body)) {
        saves++;
        await held;
      }
      await route.continue();
    });
    try {
      await editor.fill(body);
      await page.getByRole("button", { name: new RegExp(middle.title) }).click();
      await expect.poll(() => saves).toBe(1);
      await page.getByRole("button", { name: new RegExp(last.title) }).click();
      await expect(page).toHaveURL(new RegExp(`chapter=${source.id}`));
      await expect(page.getByRole("button", { name: new RegExp(source.title) })).toHaveAttribute("aria-current", "page");
      await expect(editor).toHaveText(body);
      await expect(editor).toHaveAttribute("contenteditable", "false");
      await expect(page.getByPlaceholder("제목 입력...")).toBeDisabled();
      release();
      await expect(page).toHaveURL(new RegExp(`chapter=${last.id}`));
      await expect(page.getByRole("button", { name: new RegExp(last.title) })).toHaveAttribute("aria-current", "page");
      await expect(editor).toHaveText("");
      await page.getByRole("button", { name: new RegExp(source.title) }).click();
      await expect(editor).toHaveText(body);
      await page.reload();
      await expect(editor).toHaveText(body);
      expect(saves).toBe(1);
    } finally {
      release();
    }
  });

  test("keeps the draft after a failed URL change and retries safely", async ({ page, seed }) => {
    test.skip(!seed, "authenticated e2e seed was not created");
    const { source, last } = await prepareNavigationChapters(page, seed!);
    const body = `실패해도 남아야 할 한글 원고 ${Date.now()}`;
    const editor = page.getByRole("textbox", { name: "본문 편집기" });
    let failures = 0;
    await page.route("**/write*", async (route) => {
      if (failures === 0 && route.request().method() === "POST" && route.request().postData()?.includes(body)) {
        failures++;
        await route.abort("failed");
      } else {
        await route.continue();
      }
    });
    await editor.fill(body);
    await page.evaluate((id) => {
      const url = new URL(window.location.href);
      url.searchParams.set("chapter", id);
      window.history.pushState(null, "", url);
    }, last.id);
    await expect(page.getByRole("status")).toContainText("저장 실패");
    await expect(page).toHaveURL(new RegExp(`chapter=${source.id}`));
    await expect(page.getByRole("button", { name: new RegExp(source.title) })).toHaveAttribute("aria-current", "page");
    await expect(editor).toHaveText(body);
    await expect(editor).toHaveAttribute("contenteditable", "true");
    await expect(page.getByPlaceholder("제목 입력...")).toBeEnabled();
    await page.getByRole("button", { name: new RegExp(last.title) }).click();
    await expect(page).toHaveURL(new RegExp(`chapter=${last.id}`));
    await expect(editor).toHaveText("");
    await page.getByRole("button", { name: new RegExp(source.title) }).click();
    await expect(editor).toHaveText(body);
    await page.reload();
    await expect(editor).toHaveText(body);
    expect(failures).toBe(1);
  });

});
