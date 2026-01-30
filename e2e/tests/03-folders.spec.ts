// E2E по чек-листу: раздел 3 — Работа с папками
// 3.1: создание папки; 3.3: переименование; 3.5: удаление

import { test, expect } from "@playwright/test";

function requireAuth(page: import("@playwright/test").Page) {
  return page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false);
}

test.describe("Чек-лист 3. Работа с папками", () => {
  test.use({ project: "analytics" });

  test("3.1 — Без авторизации: редирект на форму входа", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Вход", { exact: true })).toBeVisible();
  });

  test("3.1 — После входа: на главной есть раздел с папками или кнопка создания папки", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    await expect(page.getByText(/папки|тесты/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test("3.1 — Создание папки: карточка «Новая папка» → форма «Создать папку» → ввод названия → Создать", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const grid = page.getByRole("heading", { name: "Папки" }).locator("../..").locator('div[class*="grid"]');
    const addFolderCard = grid.locator("> div").filter({ has: page.locator('[class*="border-dashed"]') }).first();
    if (!(await addFolderCard.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Раздел папок не найден");
      return;
    }
    await addFolderCard.click();
    await expect(page.getByRole("heading", { name: /создать папку/i })).toBeVisible({ timeout: 5000 });
    const name = "E2E папка " + Date.now();
    await page.getByPlaceholder(/название папки/i).fill(name);
    await page.getByRole("button", { name: /^создать$/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });
  });

  test("3.3 — Переименование папки: меню папки (три точки) → Переименовать → новое имя → Сохранить", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const grid = page.getByRole("heading", { name: "Папки" }).locator("../..").locator('div[class*="grid"]');
    const firstFolderCard = grid.locator("> div").filter({ hasNot: page.locator('[class*="border-dashed"]') }).first();
    if (!(await firstFolderCard.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Нет ни одной папки для переименования");
      return;
    }
    await firstFolderCard.hover();
    await firstFolderCard.getByRole("button").click({ force: true });
    await page.getByRole("menuitem", { name: /переименовать/i }).click();
    await expect(page.getByRole("heading", { name: /переименовать папку/i })).toBeVisible({ timeout: 5000 });
    const newName = "E2E переименовано " + Date.now();
    await page.getByLabel(/название/i).fill(newName);
    await page.getByRole("button", { name: /^сохранить$/i }).click();
    await expect(page.getByText(newName)).toBeVisible({ timeout: 10_000 });
  });

  test("3.5 — Удаление папки: меню папки → Удалить → подтвердить", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const grid = page.getByRole("heading", { name: "Папки" }).locator("../..").locator('div[class*="grid"]');
    const folderCards = grid.locator("> div").filter({ hasNot: page.locator('[class*="border-dashed"]') });
    const count = await folderCards.count();
    if (count < 1) {
      test.skip(true, "Нет папок для удаления; создайте папку (3.1) и перезапустите");
      return;
    }
    const toDeleteCard = folderCards.nth(count - 1);
    await toDeleteCard.hover();
    await toDeleteCard.getByRole("button").click({ force: true });
    await page.getByRole("menuitem", { name: /удалить/i }).click();
    await expect(page.getByRole("heading", { name: /удалить папку/i })).toBeVisible({ timeout: 5000 });
    await page.getByRole("dialog").getByRole("button", { name: /^удалить$/i }).click();
    await page.waitForTimeout(800);
    const countAfter = await folderCards.count();
    expect(countAfter).toBe(count - 1);
  });
});
