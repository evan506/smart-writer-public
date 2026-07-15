import { expect, test } from "@playwright/test";

test("login page exposes the basic authentication form", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.getByLabel("이메일")).toBeVisible();
  await expect(page.getByLabel("비밀번호")).toBeVisible();
  await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
  await expect(page.getByRole("link", { name: "회원가입" })).toBeVisible();
});
