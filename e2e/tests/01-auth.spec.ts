// E2E по чек-листу: раздел 1 — Авторизация и вход
// Чек-лист 1.1: Открыть приложение, форма авторизации, кнопка «Отправить код»

import { test, expect } from "@playwright/test";

test.describe("Чек-лист 1. Авторизация и вход", () => {
  test.use({ project: "analytics" });

  test("1.1 — Открыть приложение, форма входа отображается (Вход, Email, Отправить код)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Вход", { exact: true })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /отправить код/i })).toBeVisible();
  });

  test("1.1 — Описание шаблона: ввести email для получения кода", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByText(/введите email для получения кода входа/i)
    ).toBeVisible();
  });

  test("1.3 — Выход: Профиль → Выйти → редирект на авторизацию", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    await page.getByRole("link", { name: /профиль/i }).click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByText("Профиль", { exact: true })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: /выйти/i }).click();
    await expect(page.getByText("Вход", { exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
