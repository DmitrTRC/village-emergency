import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { NewIncidentInput, CloseIncidentInput, CommentInput } from "@village/shared";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";
import {
  createIncident, listVisible, getIncident,
  acceptIncident, closeIncident, addComment,
} from "../../services/incidents.js";
import { checkIncidentRate } from "../../services/ratelimit.js";
import { canView } from "../../domain/policy.js";

export function incidentsRoutes(ctx: AppContext) {
  const app = new Hono<{ Variables: AuthedVars }>();

  app.get("/", async (c) => {
    const user = c.get("user");
    return c.json(await listVisible(ctx.db, user));
  });

  app.get("/:id", async (c) => {
    const user = c.get("user");
    const inc = await getIncident(ctx.db, c.req.param("id"));
    if (!inc) return c.json({ error: "not found" }, 404);
    if (!canView(user, inc)) return c.json({ error: "forbidden" }, 403);
    return c.json(inc);
  });

  app.post("/", zValidator("json", NewIncidentInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const rate = await checkIncidentRate(ctx.db, user.id, input.level);
    if (!rate.allowed) return c.json({ error: rate.reason }, 429);

    const res = await createIncident(ctx.db, user.id, input);
    const uploads = await Promise.all(
      res.uploads.map(async (u) => ({
        mediaId: u.mediaId,
        s3Key: u.s3Key,
        url: await ctx.media.presignPut(u.s3Key, "application/octet-stream"),
      })),
    );
    await ctx.sse.publish({ type: "incident.delivered", id: res.incident.id });
    return c.json({ incident: res.incident, uploads }, 201);
  });

  app.post("/:id/accept", async (c) => {
    const user = c.get("user");
    const inc = await acceptIncident(ctx.db, user, c.req.param("id"));
    await ctx.sse.publish({ type: "incident.accepted", id: inc.id });
    return c.json(inc);
  });

  app.post("/:id/close", zValidator("json", CloseIncidentInput), async (c) => {
    const user = c.get("user");
    const { reason } = c.req.valid("json");
    const inc = await closeIncident(ctx.db, user, c.req.param("id"), reason);
    await ctx.sse.publish({ type: "incident.closed", id: inc.id });
    return c.json(inc);
  });

  app.post("/:id/comments", zValidator("json", CommentInput), async (c) => {
    const user = c.get("user");
    const { text } = c.req.valid("json");
    const comment = await addComment(ctx.db, user, c.req.param("id"), text);
    await ctx.sse.publish({ type: "incident.commented", id: c.req.param("id") });
    return c.json(comment, 201);
  });

  return app;
}
