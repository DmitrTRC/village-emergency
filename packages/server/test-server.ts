// E2E-only сервер: реальный Hono + Postgres (testcontainers), без Telegram-бота.
// Поднимается Playwright'ом (см. packages/web/playwright.config.ts). Тестовые
// роуты /__test__/* дают спекам сеять данные и логин-nonce без боевого бота.
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { IncidentLevel } from "@village/shared";
import { startPg } from "./test/helpers/pg.js";
import { buildTestApp } from "./test/helpers/app.js";
import { makeUser } from "./test/helpers/factories.js";
import { createIncident } from "./src/services/incidents.js";
import { loginNonces } from "./src/db/schema.js";

const PORT = Number(process.env.E2E_API_PORT ?? 8788);
const WEB_ORIGIN = process.env.E2E_WEB_ORIGIN ?? "http://localhost:4173";

const pg = await startPg();
const api = await buildTestApp(pg);

const app = new Hono();
app.use("*", cors({ origin: WEB_ORIGIN, allowHeaders: ["content-type", "authorization"] }));

app.post("/__test__/reset", async (c) => {
  await pg.sql`TRUNCATE houses, users, registration_requests, incidents,
    incident_media, incident_comments, incident_events, sessions, login_nonces
    RESTART IDENTITY CASCADE`;
  return c.json({ ok: true });
});

app.post("/__test__/seed-user", async (c) => {
  const body = await c.req.json<{ role?: "resident" | "commander"; name?: string; tg?: string }>();
  const tg = body.tg ?? `tg-${crypto.randomUUID()}`;
  const user = await makeUser(pg.db, { role: body.role, name: body.name, tg });
  return c.json({ id: user.id, tg });
});

app.post("/__test__/login-nonce", async (c) => {
  const { tg } = await c.req.json<{ tg: string }>();
  const nonce = crypto.randomUUID();
  await pg.db.insert(loginNonces).values({
    nonce,
    telegramUserId: tg,
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return c.json({ token: nonce });
});

app.post("/__test__/seed-incident", async (c) => {
  const body = await c.req.json<{ authorId: string; level: IncidentLevel; text?: string }>();
  const { incident } = await createIncident(pg.db, body.authorId, {
    id: crypto.randomUUID(),
    level: body.level,
    ...(body.text ? { text: body.text } : {}),
  });
  return c.json({ id: incident.id });
});

app.all("*", (c) => api.fetch(c.req.raw));

const server = serve({ fetch: app.fetch, port: PORT });
console.log(`e2e api on :${PORT}`);

async function shutdown() {
  server.close();
  await api.close();
  await pg.stop();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
