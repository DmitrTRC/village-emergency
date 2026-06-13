import { test, expect } from "@playwright/test";
import { reset, seedUser, loginAs } from "./helpers";

test("таб-бар ведёт по вкладкам, /new достижим из UI", async ({ browser, request }) => {
  await reset(request);
  const resident = await seedUser(request, { role: "resident", name: "Житель" });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, request, resident.tg);

  await expect(page.getByRole("link", { name: /карта/i })).toBeVisible();
  await page.getByRole("link", { name: /карта/i }).click();
  await expect(page).toHaveURL(/\/map$/);

  await page.getByRole("link", { name: /лента/i }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole("link", { name: /сообщить о другом/i }).click();
  await expect(page).toHaveURL(/\/new$/);
  await expect(page.getByRole("heading", { name: "Новый инцидент" })).toBeVisible();

  await ctx.close();
});

test("красная кнопка: удержание отправляет тревогу", async ({ browser, request }) => {
  await reset(request);
  const resident = await seedUser(request, { role: "resident", name: "Житель" });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginAs(page, request, resident.tg);

  const btn = page.getByTestId("panic-button");
  await btn.dispatchEvent("pointerdown");
  await page.waitForTimeout(1700); // > HOLD_MS
  await expect(btn).toContainText(/отпустите/i);
  await btn.dispatchEvent("pointerup");
  await expect(btn).toContainText(/отправлен/i);

  await ctx.close();
});
