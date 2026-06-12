import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import { loginNonces, users } from "../../db/schema.js";

const ExchangeBody = z.object({ token: z.string().min(1) });
const RefreshBody = z.object({ refreshToken: z.string().min(1) });

export function authRoutes(ctx: AppContext) {
  const app = new Hono();

  app.post("/tg/exchange", zValidator("json", ExchangeBody), async (c) => {
    const { token } = c.req.valid("json");
    const nonce = await ctx.db.query.loginNonces.findFirst({ where: eq(loginNonces.nonce, token) });
    if (!nonce || nonce.usedAt || nonce.expiresAt < new Date() || !nonce.telegramUserId) {
      return c.json({ error: "invalid or expired token" }, 401);
    }
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.telegramUserId, nonce.telegramUserId),
    });
    if (!user) return c.json({ error: "user not found" }, 404);

    await ctx.db.update(loginNonces).set({ usedAt: new Date() }).where(eq(loginNonces.nonce, token));
    const pair = await ctx.sessions.issue(user.id, user.role);
    return c.json({ ...pair, user: { id: user.id, name: user.name, role: user.role } });
  });

  app.post("/refresh", zValidator("json", RefreshBody), async (c) => {
    try {
      const pair = await ctx.sessions.rotate(c.req.valid("json").refreshToken);
      return c.json(pair);
    } catch {
      return c.json({ error: "invalid refresh" }, 401);
    }
  });

  return app;
}
