import { test, expect } from "@playwright/test";
import { reset, seedUser, loginAs, expectInFeed } from "./helpers";

test("emergency, созданный офлайн, доходит до командира после возврата сети", async ({
  browser,
  request,
}) => {
  await reset(request);
  const commander = await seedUser(request, { role: "commander", name: "Командир" });
  const resident = await seedUser(request, { role: "resident", name: "Житель" });
  const marker = `пожар-${Date.now()}`;

  const resCtx = await browser.newContext();
  const page = await resCtx.newPage();
  await loginAs(page, request, resident.tg);

  await page.goto("/new");
  await page.getByLabel("Тревога").check();
  await page.getByLabel("Описание").fill(marker);

  // офлайн: отправка кладёт инцидент в outbox, доставки нет
  await resCtx.setOffline(true);
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(page.getByText("ожидает сети")).toBeVisible();

  // сеть вернулась → drain по событию 'online' шлёт POST /incidents
  await resCtx.setOffline(false);

  // командир в своём контексте видит доставленный emergency
  const cmdCtx = await browser.newContext();
  const cmdPage = await cmdCtx.newPage();
  await loginAs(cmdPage, request, commander.tg);
  await expectInFeed(cmdPage, marker);

  await resCtx.close();
  await cmdCtx.close();
});
