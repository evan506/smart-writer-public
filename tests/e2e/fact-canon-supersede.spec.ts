import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getAuthE2EEnv } from "./helpers/auth-seed";

type SupabaseServiceClient = ReturnType<typeof serviceClient>;

type FactCanonSupersedeSeed = {
  email: string;
  password: string;
  userId: string;
  projectId: string;
  chapterId: string;
  entityId: string;
  oldFactId: string;
  projectTitle: string;
  chapterTitle: string;
  chapterContent: string;
};

function serviceClient(url: string, key: string) {
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function seedFactCanonSupersedeE2E(): Promise<FactCanonSupersedeSeed | null> {
  const env = getAuthE2EEnv();
  if (!env.enabled) return null;

  const supabase = serviceClient(env.url, env.serviceKey);
  const stamp = Date.now();
  const email = `smartwriter.e2e.fact.${stamp}@example.com`;
  const password = "SmartWriter-fact-e2e-1234!";
  const projectTitle = `설정 대체 E2E 프로젝트 ${stamp}`;
  const chapterTitle = "정체의 충돌";
  const chapterContent =
    "리엔은 마을 사람들에게 인간이라고 불렸다. 오래된 기록에는 리엔이 하이엘프라고 적혀 있었다.";

  const { data: userData, error: userError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
  if (userError) throw userError;
  const userId = userData.user.id;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      user_id: userId,
      title: projectTitle,
      genre: "판타지",
      description: "fact canon supersede e2e fixture",
      metadata: { testRun: "fact-canon-supersede-e2e", stamp },
    })
    .select("id")
    .single();
  if (projectError) throw projectError;

  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .insert({
      project_id: project.id,
      chapter_num: 1,
      title: chapterTitle,
      content: chapterContent,
      word_count: chapterContent.replace(/\s/g, "").length,
    })
    .select("id")
    .single();
  if (chapterError) throw chapterError;

  const { data: entity, error: entityError } = await supabase
    .from("entities")
    .insert({
      project_id: project.id,
      name: "리엔",
      type: "CHARACTER",
      summary: "설정 대체 e2e용 인물",
      aliases: [],
      metadata: { importance: "MAIN" },
    })
    .select("id")
    .single();
  if (entityError) throw entityError;

  const { data: oldFact, error: oldFactError } = await supabase
    .from("canon_facts")
    .insert({
      project_id: project.id,
      entity_id: entity.id,
      fact_type: "ATTRIBUTE",
      fact_key: "species",
      value: "하이엘프다",
      status: "APPROVED",
      confidence: 0.9,
      established_chapter_id: chapter.id,
      valid_from_chapter_id: chapter.id,
      approved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (oldFactError) throw oldFactError;

  const { error: suggestionError } = await supabase
    .from("fact_suggestions")
    .insert({
      project_id: project.id,
      chapter_id: chapter.id,
      matched_entity_id: entity.id,
      fact_type: "ATTRIBUTE",
      fact_key: "species",
      value: "인간이다",
      evidence_text: "리엔은 마을 사람들에게 인간이라고 불렸다.",
      confidence: 0.84,
      status: "PENDING",
    });
  if (suggestionError) throw suggestionError;

  return {
    email,
    password,
    userId,
    projectId: project.id,
    chapterId: chapter.id,
    entityId: entity.id,
    oldFactId: oldFact.id,
    projectTitle,
    chapterTitle,
    chapterContent,
  };
}

async function cleanupFactCanonSupersedeE2E(seed: FactCanonSupersedeSeed | null) {
  if (!seed) return;

  const env = getAuthE2EEnv();
  if (!env.enabled) return;

  const supabase = serviceClient(env.url, env.serviceKey);
  await supabase.from("projects").delete().eq("id", seed.projectId);
  await supabase.auth.admin.deleteUser(seed.userId);
}

async function login(page: Page, seed: FactCanonSupersedeSeed) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(seed.email);
  await page.getByLabel("비밀번호").fill(seed.password);
  await page.getByRole("button", { name: "로그인" }).click();
}

async function fetchOldFact(
  service: SupabaseServiceClient,
  oldFactId: string
) {
  const { data, error } = await service
    .from("canon_facts")
    .select("status, superseded_by, valid_until_chapter_id")
    .eq("id", oldFactId)
    .single();
  if (error) throw error;
  return data;
}

test.describe("fact canon explicit supersede flow", () => {
  let seed: FactCanonSupersedeSeed | null = null;

  test.beforeAll(async () => {
    const env = getAuthE2EEnv();
    if (!env.enabled) return;

    seed = await seedFactCanonSupersedeE2E();
  });

  test.afterAll(async () => {
    await cleanupFactCanonSupersedeE2E(seed);
  });

  test("warns on conflicting fact and replaces it only after explicit confirmation", async ({ page }) => {
    const env = getAuthE2EEnv();
    test.skip(!env.enabled, env.enabled ? "" : env.reason);
    test.skip(!seed, "fact canon supersede e2e seed was not created");
    if (!env.enabled || !seed) return;

    const service = serviceClient(env.url, env.serviceKey);

    await login(page, seed);
    await expect(page).toHaveURL(/\/projects$/);
    await page.goto(`/projects/${seed.projectId}/write?chapter=${seed.chapterId}`);

    await page.getByRole("button", { name: "확인" }).click();
    await expect(page.getByText("검토할 세부 설정 (1)")).toBeVisible();
    await expect(page.getByText("기존 승인 설정과 값이 다릅니다")).toBeVisible();
    await expect(page.getByText("하이엘프다")).toBeVisible();
    await expect(page.getByText("승인해도 기존 설정은 자동으로 바뀌지 않습니다.")).toBeVisible();

    const before = await fetchOldFact(service, seed.oldFactId);
    expect(before).toEqual({
      status: "APPROVED",
      superseded_by: null,
      valid_until_chapter_id: null,
    });

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("기존 승인 설정을 이 설정으로 대체합니다");
      await dialog.accept();
    });
    await page.getByRole("button", { name: "기존 설정을 이 설정으로 대체" }).click();

    await expect(page.getByText("기존 설정을 대체하고 새 설정을 승인했습니다")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("검토할 세부 설정 (1)")).toBeHidden({ timeout: 10_000 });

    const after = await fetchOldFact(service, seed.oldFactId);
    expect(after.status).toBe("SUPERSEDED");
    expect(after.superseded_by).toBeTruthy();
    expect(after.valid_until_chapter_id).toBe(seed.chapterId);

    await page.getByRole("button", { name: "사전" }).click();
    await page.getByPlaceholder("인물, 장소, 설정 검색...").fill("리엔");
    await page.getByRole("button", { name: /리엔/ }).click();
    await expect(page.getByText("승인된 설정")).toBeVisible();
    await expect(page.getByText("인간이다")).toBeVisible();
    await expect(page.locator("main")).toContainText(
      "1화 · 정체의 충돌 근거: 리엔은 마을 사람들에게 인간이라고 불렸다."
    );
  });
});
