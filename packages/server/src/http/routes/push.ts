import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { PushSubscriptionDTO } from "@village/shared";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";
import { users } from "../../db/schema.js";

export function pushRoutes(ctx: AppContext) {
  const app = new Hono<{ Variables: AuthedVars }>();

  app.put("/subscription", async (c) => {
    const sub = PushSubscriptionDTO.parse(await c.req.json());
    await ctx.db
      .update(users)
      .set({ pushSubscription: sub })
      .where(eq(users.id, c.get("user").id));
    return c.json({ ok: true });
  });

  app.delete("/subscription", async (c) => {
    await ctx.db
      .update(users)
      .set({ pushSubscription: null })
      .where(eq(users.id, c.get("user").id));
    return c.json({ ok: true });
  });

  return app;
}
