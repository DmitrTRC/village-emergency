import { test, expect } from "@playwright/test";
import { reset, seedUser, seedIncident, loginAs, expectNotInFeed } from "./helpers";

test("отклонение (close false) убирает инцидент из общей ленты", async ({ browser, request }) => {
  await reset(request);
  const commander = await seedUser(request, { role: "commander" });
  const author = await seedUser(request, { role: "resident" });
  const viewer = await seedUser(request, { role: "resident" });
  const marker = `шум-${Date.now()}`;
  // emergency сразу public — виден всем
  const inc = await seedIncident(request, { authorId: author.id, level: "emergency", text: marker });

  const vCtx = await browser.newContext();
  const vPage = await vCtx.newPage();
  await loginAs(vPage, request, viewer.tg);
  await expect(vPage.getByText(marker)).toBeVisible();

  // командир отклоняет → private
  const cCtx = await browser.newContext();
  const cPage = await cCtx.newPage();
  await loginAs(cPage, request, commander.tg);
  await cPage.goto(`/i/${inc.id}`);
  await cPage.getByRole("button", { name: "Отклонить" }).click();
  await expect(cPage.getByTestId("status-badge")).toHaveText("Закрыто");

  // исчез из общей ленты второго жителя
  await expectNotInFeed(vPage, marker);

  await vCtx.close();
  await cCtx.close();
});
