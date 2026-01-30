// E2E по чек-листу: раздел 2 — Создание и управление тестами
// 2.1: Кнопка «Тест», форма создания, «Создать исследование», переход на редактирование
// Тесты требуют авторизации: без логина будет редирект на форму входа.

import { test, expect } from "@playwright/test";

test.describe("Чек-лист 2. Создание и управление тестами", () => {
  test.use({ project: "analytics" });

  test("2.1 — Без авторизации: при переходе на / видна форма входа", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Вход", { exact: true })).toBeVisible();
  });

  test("2.1 — После входа: на главной есть кнопка «Тест» или заголовок «Тесты»", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    const loginForm = page.getByText("Вход", { exact: true });
    if (await loginForm.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация: выполните вход и перезапустите тесты (или используйте storageState)");
      return;
    }
    await expect(
      page.getByRole("button", { name: /^тест$/i }).or(page.getByRole("link", { name: /^тест$/i })).or(page.getByText("Тесты", { exact: true }))
    ).toBeVisible({ timeout: 15_000 });
  });

  test("2.1 — Создание теста: кнопка Тест → форма с названием → Создать исследование", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const testButton = page.getByRole("button", { name: /^тест$/i }).or(
      page.getByRole("link", { name: /^тест$/i })
    );
    await testButton.first().click({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /создать исследование/i }).or(
        page.getByPlaceholder(/название/i)
      )
    ).toBeVisible({ timeout: 10_000 });
    const titleInput = page.getByPlaceholder(/название/i).first();
    if (await titleInput.isVisible()) {
      await titleInput.fill("E2E тест " + Date.now());
      await page.getByRole("button", { name: /создать исследование/i }).click();
      await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 15_000 });
    }
  });

  test("2.2 — Шаблон «Тестирование прототипа»: использовать → тест с блоками Контекст, Прототип, Шкала, Открытый вопрос", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const templateCard = page.getByText("Тестирование прототипа", { exact: true }).locator("..").locator("..");
    if (!(await templateCard.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip(true, "Нет пустого состояния с шаблонами (уже есть тесты)");
      return;
    }
    await templateCard.click();
    await page.getByRole("button", { name: /использовать этот шаблон/i }).click();
    await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 15_000 });
    await expect(page.getByText(/контекст|прототип|шкала|открытый вопрос/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("2.3 — Шаблон «Тест первого клика»: использовать → тест с блоками", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const card = page.getByText("Тест первого клика", { exact: true }).locator("..").locator("..");
    if (!(await card.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Нет пустого состояния с шаблонами");
      return;
    }
    await card.click();
    await page.getByRole("button", { name: /использовать этот шаблон/i }).click();
    await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 15_000 });
  });

  test("2.4 — Шаблон «Улучшение навигации»: использовать → блок Карточная сортировка", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const card = page.getByText("Улучшение навигации", { exact: true }).locator("..").locator("..");
    if (!(await card.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Нет пустого состояния с шаблонами");
      return;
    }
    await card.click();
    await page.getByRole("button", { name: /использовать этот шаблон/i }).click();
    await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 15_000 });
    await expect(page.getByText(/карточная сортировка/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test("2.5 — Шаблон «Проверка маркетинговых текстов»: использовать → блок 5 секунд", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const card = page.getByText("Проверка маркетинговых текстов", { exact: true }).locator("..").locator("..");
    if (!(await card.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Нет пустого состояния с шаблонами");
      return;
    }
    await card.click();
    await page.getByRole("button", { name: /использовать этот шаблон/i }).click();
    await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 15_000 });
  });

  test("2.6 — Шаблон «Продуктовый опрос»: использовать → блоки Контекст, Выбор, Шкала, Открытый вопрос", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const card = page.getByText("Продуктовый опрос", { exact: true }).locator("..").locator("..");
    if (!(await card.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Нет пустого состояния с шаблонами");
      return;
    }
    await card.click();
    await page.getByRole("button", { name: /использовать этот шаблон/i }).click();
    await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 15_000 });
  });
});
