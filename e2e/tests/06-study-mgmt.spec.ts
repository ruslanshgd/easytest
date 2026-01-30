// E2E по чек-листу: раздел 6 — Управление тестами
// 6.2 Дубликация, 6.5 Удаление (6.1 Переименование — в UI нет в меню теста)

import { test, expect } from "@playwright/test";

function requireAuth(page: import("@playwright/test").Page) {
  return page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false);
}

test.describe("Чек-лист 6. Управление тестами", () => {
  test.use({ project: "analytics" });

  test("6.x — Без авторизации: редирект на вход", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Вход", { exact: true })).toBeVisible();
  });

  test("6.2 — Дубликация теста: меню теста (три точки) → Копировать → копия с «(копия)» в списке", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const studyCards = page.locator(".cursor-pointer").filter({ has: page.getByRole("checkbox") });
    if ((await studyCards.count()) < 1) {
      test.skip(true, "Нет тестов для копирования");
      return;
    }
    const firstCard = studyCards.first();
    await firstCard.hover();
    await firstCard.getByRole("button").first().click({ force: true });
    await page.getByRole("menuitem", { name: /копировать/i }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByText(/\(копия\)/)).toBeVisible({ timeout: 10_000 });
  });

  test("6.5 — Удаление теста: меню теста → Удалить → подтвердить → теста нет в списке", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const studyCards = page.locator(".cursor-pointer").filter({ has: page.getByRole("checkbox") });
    const count = await studyCards.count();
    if (count < 2) {
      test.skip(true, "Нужно минимум 2 теста (один удалим); создайте тест и перезапустите");
      return;
    }
    const toDelete = studyCards.nth(1);
    const titleToDelete = await toDelete.locator("span").first().textContent();
    await toDelete.hover();
    await toDelete.getByRole("button").first().click({ force: true });
    await page.getByRole("menuitem", { name: /удалить/i }).click();
    await expect(page.getByRole("heading", { name: /удалить/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole("dialog").getByRole("button", { name: /да, удалить этот тест/i }).click();
    await page.waitForTimeout(1000);
    if (titleToDelete) {
      await expect(page.getByText(titleToDelete.trim())).not.toBeVisible({ timeout: 5000 });
    }
  });
});
