import { test, expect } from "@playwright/test";
import { reset, seedUser, seedIncident, loginAs, expectInFeed } from "./helpers";

test("командир принимает offence → инцидент появляется у второго жителя", async ({
  browser,
  request,
}) => {
  await reset(request);
  const commander = await seedUser(request, { role: "commander" });
  const author = await seedUser(request, { role: "resident" });
  const viewer = await seedUser(request, { role: "resident" });
  const marker = `кража-${Date.now()}`;
  const inc = await seedIncident(request, { authorId: author.id, level: "offence", text: marker });

  // второй житель пока не видит private-инцидент
  const vCtx = await browser.newContext();
  const vPage = await vCtx.newPage();
  await loginAs(vPage, request, viewer.tg);
  await expect(vPage.getByText(marker)).toHaveCount(0);

  // командир принимает → public
  const cCtx = await browser.newContext();
  const cPage = await cCtx.newPage();
  await loginAs(cPage, request, commander.tg);
  await cPage.goto(`/i/${inc.id}`);
  await cPage.getByRole("button", { name: "Принять" }).click();
  await expect(cPage.getByTestId("status-badge")).toHaveText("Принято");

  // теперь виден второму жителю
  await expectInFeed(vPage, marker);

  await vCtx.close();
  await cCtx.close();
});
