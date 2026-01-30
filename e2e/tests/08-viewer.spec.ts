// E2E по чек-листу: раздел 8 — Прохождение теста респондентом (viewer)
// 8.1: открытие по ссылке; 8.2 Контекст; 8.4 Открытый вопрос; 8.20: страница завершения /finished

import { test, expect } from "@playwright/test";

const runToken = process.env.E2E_RUN_TOKEN;

test.describe("Чек-лист 8. Viewer — прохождение теста респондентом", () => {
  test.use({ project: "viewer" });

  test("8.20 — Страница завершения /finished отображает текст благодарности", async ({
    page,
  }) => {
    await page.goto("/finished");
    await expect(
      page.getByText(/поздравляем|завершили тест/i)
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByText(/ответьте на несколько вопросов|спасибо за прохождение|вопросов о вашем опыте/i)
    ).toBeVisible({ timeout: 5000 });
  });

  test("8.1 — Открытие /run/{token}: загрузка или сообщение об ошибке (без валидного токена)", async ({
    page,
  }) => {
    await page.goto("/run/00000000-0000-0000-0000-000000000001");
    await expect(
      page.getByText(/загрузка|тест не найден|ошибка|токен/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("8.2 — Прохождение блока «Контекст»: заголовок/описание, кнопка Далее", async ({
    page,
  }) => {
    if (!runToken) {
      test.skip(true, "Задайте E2E_RUN_TOKEN (токен опубликованного теста с блоком Контекст) для проверки");
      return;
    }
    await page.goto("/run/" + runToken);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(
      page.getByRole("button", { name: /далее/i }).or(page.getByText(/контекст|заголовок|привет/i))
    ).toBeVisible({ timeout: 15_000 });
    const nextBtn = page.getByRole("button", { name: /далее/i }).first();
    if (await nextBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test("8.4 — Прохождение блока «Открытый вопрос»: вопрос, поле ввода, Далее", async ({
    page,
  }) => {
    if (!runToken) {
      test.skip(true, "Задайте E2E_RUN_TOKEN для проверки");
      return;
    }
    await page.goto("/run/" + runToken);
    await page.waitForLoadState("networkidle").catch(() => {});
    await expect(
      page.getByRole("button", { name: /далее/i }).or(page.getByRole("textbox")).or(page.getByPlaceholder(/введите|ответ/i))
    ).toBeVisible({ timeout: 15_000 });
    const textbox = page.getByRole("textbox").or(page.getByPlaceholder(/введите|ответ/i)).first();
    if (await textbox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await textbox.fill("E2E ответ " + Date.now());
      await page.getByRole("button", { name: /далее/i }).first().click();
    }
  });
});
