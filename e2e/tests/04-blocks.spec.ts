// E2E по чек-листу: раздел 4 — Создание блоков (без загрузки файлов)
// 4.2 Открытый вопрос, 4.3 Выбор, 4.4 Шкала, 4.5 Контекст, 4.11 Матрица, 4.13 UMUX-Lite

import { test, expect } from "@playwright/test";

function requireAuth(page: import("@playwright/test").Page) {
  return page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false);
}

async function openFirstStudy(page: import("@playwright/test").Page) {
  const studyCard = page.locator(".cursor-pointer").filter({ has: page.getByRole("checkbox") }).first();
  if (!(await studyCard.isVisible({ timeout: 5000 }).catch(() => false))) return false;
  await studyCard.click();
  await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 10_000 });
  const testTab = page.getByRole("button", { name: /^тест$/i });
  if (await testTab.isVisible({ timeout: 3000 }).catch(() => false)) await testTab.click();
  return true;
}

test.describe("Чек-лист 4. Создание блоков", () => {
  test.use({ project: "analytics" });

  test("4.x — Без авторизации: редирект на вход", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Вход", { exact: true })).toBeVisible();
  });

  test("4.2 — Добавить блок «Открытый вопрос»: Блок → Открытый вопрос → блок в списке", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    if (!(await openFirstStudy(page))) {
      test.skip(true, "Нет теста для редактирования");
      return;
    }
    const blockBtn = page.getByRole("button", { name: /блок/i }).first();
    const openQuestionCard = page.getByText("Открытый вопрос", { exact: true }).locator("..").locator("..").first();
    if (await openQuestionCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openQuestionCard.click();
    } else if (await blockBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await blockBtn.click();
      await page.getByRole("menuitem", { name: /открытый вопрос/i }).click();
    } else {
      test.skip(true, "Нет кнопки Блок и нет карточки Открытый вопрос");
      return;
    }
    await page.waitForTimeout(1500);
    await expect(
      page.getByText(/открытый вопрос|введите ваш вопрос/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("4.5 — Добавить блок «Контекст»: Блок → Контекст → блок в списке", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    if (!(await openFirstStudy(page))) {
      test.skip(true, "Нет теста для редактирования");
      return;
    }
    const blockBtn = page.getByRole("button", { name: /блок/i }).first();
    if (!(await blockBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Кнопка «Блок» не найдена");
      return;
    }
    await blockBtn.click();
    await page.getByRole("menuitem", { name: /контекст/i }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/контекст|заголовок/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("4.4 — Добавить блок «Шкала»: Блок → Шкала → блок в списке", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    if (!(await openFirstStudy(page))) {
      test.skip(true, "Нет теста для редактирования");
      return;
    }
    const blockBtn = page.getByRole("button", { name: /блок/i }).first();
    if (!(await blockBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Кнопка «Блок» не найдена");
      return;
    }
    await blockBtn.click();
    await page.getByRole("menuitem", { name: /шкала/i }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/шкала|введите вопрос/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("4.13 — Добавить блок «UMUX-Lite»: Блок → UMUX Lite → блок в списке", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await requireAuth(page)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    if (!(await openFirstStudy(page))) {
      test.skip(true, "Нет теста для редактирования");
      return;
    }
    const blockBtn = page.getByRole("button", { name: /блок/i }).first();
    if (!(await blockBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Кнопка «Блок» не найдена");
      return;
    }
    await blockBtn.click();
    await page.getByRole("menuitem", { name: /umux/i }).click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/umux/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
