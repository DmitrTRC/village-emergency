import { type APIRequestContext, type Page, expect } from "@playwright/test";

const API = "http://localhost:8788";

type Role = "resident" | "commander";
type Level = "emergency" | "offence" | "attention";

export async function reset(request: APIRequestContext): Promise<void> {
  await request.post(`${API}/__test__/reset`);
}

export async function seedUser(
  request: APIRequestContext,
  opts: { role?: Role; name?: string } = {},
): Promise<{ id: string; tg: string }> {
  const res = await request.post(`${API}/__test__/seed-user`, { data: opts });
  return res.json();
}

export async function seedIncident(
  request: APIRequestContext,
  opts: { authorId: string; level: Level; text?: string },
): Promise<{ id: string }> {
  const res = await request.post(`${API}/__test__/seed-incident`, { data: opts });
  return res.json();
}

export async function loginNonce(request: APIRequestContext, tg: string): Promise<string> {
  const res = await request.post(`${API}/__test__/login-nonce`, { data: { tg } });
  return (await res.json()).token;
}

export async function loginAs(page: Page, request: APIRequestContext, tg: string): Promise<void> {
  const token = await loginNonce(request, tg);
  await page.goto(`/auth/callback?token=${token}`);
  await expect(page.getByRole("heading", { name: "Лента" })).toBeVisible();
}

// Лента обновляется по SSE; на случай флакости — перезагружаем, пока не сойдётся.
export async function expectInFeed(page: Page, text: string): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.getByText(text)).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
}

export async function expectNotInFeed(page: Page, text: string): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Лента" })).toBeVisible({ timeout: 2000 });
    await expect(page.getByText(text)).toHaveCount(0);
  }).toPass({ timeout: 20_000 });
}
