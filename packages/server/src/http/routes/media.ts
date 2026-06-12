import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";
import { incidentMedia, incidents } from "../../db/schema.js";

const PatchBody = z.object({ uploaded: z.literal(true) });

export function mediaRoutes(ctx: AppContext) {
  const app = new Hono<{ Variables: AuthedVars }>();

  app.patch("/:id/media/:mediaId", zValidator("json", PatchBody), async (c) => {
    const user = c.get("user");
    const incidentId = c.req.param("id");
    const mediaId = c.req.param("mediaId");

    const inc = await ctx.db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) });
    if (!inc) return c.json({ error: "not found" }, 404);
    if (inc.authorId !== user.id) return c.json({ error: "forbidden" }, 403);

    const [row] = await ctx.db
      .update(incidentMedia)
      .set({ uploadStatus: "uploaded" })
      .where(and(eq(incidentMedia.id, mediaId), eq(incidentMedia.incidentId, incidentId)))
      .returning();
    if (!row) return c.json({ error: "not found" }, 404);
    return c.json({ uploadStatus: row.uploadStatus });
  });

  return app;
}
