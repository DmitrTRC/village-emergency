import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";
import { registrationRequests } from "../../db/schema.js";

export function registrationsRoutes(ctx: AppContext) {
  const app = new Hono<{ Variables: AuthedVars }>();

  app.use("*", async (c, next) => {
    if (c.get("user").role !== "commander") return c.json({ error: "forbidden" }, 403);
    return next();
  });

  app.get("/", async (c) => {
    const rows = await ctx.db.query.registrationRequests.findMany({
      where: eq(registrationRequests.status, "pending"),
    });
    return c.json(rows);
  });

  app.post("/:id/approve", async (c) => {
    const user = await ctx.registration.approve(c.req.param("id"), c.get("user").id);
    return c.json({ ok: true, userId: user.id });
  });

  app.post("/:id/reject", async (c) => {
    await ctx.registration.reject(c.req.param("id"), c.get("user").id);
    return c.json({ ok: true });
  });

  return app;
}
