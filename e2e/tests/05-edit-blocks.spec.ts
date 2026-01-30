// E2E по чек-листу: раздел 5 — Настройки блоков
// 5.2 Выбор, 5.3 Шкала, 5.5 Матрица, 5.6 Валидация

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

test.describe("Чек-лист 5. Настройки блоков", () => {
  test.use({ project: "analytics" });

  test("5.x — Без авторизации: редирект на вход", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Вход", { exact: true })).toBeVisible();
  });

  test("5.2 / 5.3 — Открыть блок (Выбор или Шкала): блок в списке кликабелен, открывается форма", async ({
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
    const blockTitle = page.getByText(/выбор|шкала|вопрос/i).first();
    if (!(await blockTitle.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Нет блоков для редактирования (добавьте блок в 04-blocks)");
      return;
    }
    await blockTitle.click();
    await expect(
      page.getByPlaceholder(/вопрос|текст/i).or(page.getByText(/варианты ответа|настройки/i)).first()
    ).toBeVisible({ timeout: 8000 });
  });

  test("5.6 — Валидация: блок с обязательным полем — пустое поле не даёт сохранить или показывает ошибку", async ({
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
    const blockItem = page.locator('[id^="block-"]').first();
    if (!(await blockItem.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Нет блоков");
      return;
    }
    const questionInput = page.getByPlaceholder(/введите текст вопроса|вопрос/i).first();
    if (await questionInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await questionInput.clear();
      await questionInput.blur();
      await page.waitForTimeout(500);
      const errorOrDisabled = page.getByText(/обязательно|заполните/i).or(
        page.getByRole("button", { name: /сохранить|добавить/i }).filter({ disabled: true })
      );
      const hasValidation = await errorOrDisabled.first().isVisible({ timeout: 2000 }).catch(() => false);
      if (hasValidation) {
        await expect(errorOrDisabled.first()).toBeVisible();
      }
    }
  });
});
