// E2E по чек-листу: раздел 7 — Публикация и шаринг
// 7.1, 7.3, 7.4: вкладка «Поделиться», статус, кнопка «Копировать ссылку»

import { test, expect } from "@playwright/test";

test.describe("Чек-лист 7. Публикация и шаринг", () => {
  test.use({ project: "analytics" });

  test("7.1 / 7.4 — Без авторизации: редирект на вход", async ({ page }) => {
    await page.goto("/studies/00000000-0000-0000-0000-000000000001");
    await expect(page.getByText("Вход", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("7.1 — После входа: открыть тест, вкладка «Поделиться», статус и кнопка копирования", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const studyCard = page.locator('.cursor-pointer').filter({ has: page.getByRole('checkbox') }).first();
    if (!(await studyCard.isVisible({ timeout: 5000 }))) {
      test.skip(true, "Нет ни одного теста — создайте тест вручную или через E2E 02-create-study");
      return;
    }
    await studyCard.click();
    await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 10_000 });
    await page.getByRole("button", { name: /пригласить респондентов/i }).click();
    await expect(
      page.getByText(/не опубликован|опубликован|остановлен/i)
    ).toBeVisible({ timeout: 5000 });
    await expect(
      page.getByRole("button", { name: /копировать ссылку/i })
    ).toBeVisible({ timeout: 5000 });
  });

  test("7.1 — Опубликовать: кнопка Опубликовать → подтверждение → статус Опубликован", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const studyCard = page.locator(".cursor-pointer").filter({ has: page.getByRole("checkbox") }).first();
    if (!(await studyCard.isVisible({ timeout: 5000 }))) {
      test.skip(true, "Нет ни одного теста");
      return;
    }
    await studyCard.click();
    await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 10_000 });
    const publishBtn = page.getByRole("button", { name: /опубликовать/i });
    if (!(await publishBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
      test.skip(true, "Тест уже опубликован или остановлен");
      return;
    }
    page.on("dialog", (d) => d.accept());
    await publishBtn.click();
    await page.getByRole("button", { name: /пригласить респондентов/i }).click();
    await expect(page.getByText("Опубликован")).toBeVisible({ timeout: 10_000 });
  });

  test("7.3 — Копировать ссылку: кнопка Копировать ссылку → формат viewer_url/run/token", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle").catch(() => {});
    if (await page.getByText("Вход", { exact: true }).isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Требуется авторизация");
      return;
    }
    const studyCard = page.locator(".cursor-pointer").filter({ has: page.getByRole("checkbox") }).first();
    if (!(await studyCard.isVisible({ timeout: 5000 }))) {
      test.skip(true, "Нет ни одного теста");
      return;
    }
    await studyCard.click();
    await expect(page).toHaveURL(/\/studies\/[a-f0-9-]+/i, { timeout: 10_000 });
    await page.getByRole("button", { name: /пригласить респондентов/i }).click();
    await expect(page.getByRole("button", { name: /копировать ссылку/i })).toBeVisible({ timeout: 5000 });
    await context.grantPermissions(["clipboard-read"]);
    await page.getByRole("button", { name: /копировать ссылку/i }).click();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toMatch(/\/run\/[a-zA-Z0-9_-]+/);
  });
});
