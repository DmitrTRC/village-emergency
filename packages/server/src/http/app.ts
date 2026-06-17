import { Hono } from "hono";
import type { AppContext } from "./context.js";
import { authMiddleware, errorHandler, type AuthedVars } from "./middleware.js";
import { incidentsRoutes } from "./routes/incidents.js";
import { registrationsRoutes } from "./routes/registrations.js";
import { mediaRoutes } from "./routes/media.js";
import { eventsRoutes } from "./routes/events.js";
import { pushRoutes } from "./routes/push.js";
import { authRoutes } from "./routes/auth.js";
import { requestLogger } from "./logging.js";

export function buildApp(ctx: AppContext): Hono<{ Variables: AuthedVars }> {
  const app = new Hono<{ Variables: AuthedVars }>();
  app.onError(errorHandler);
  app.use("*", requestLogger());

  app.get("/health", (c) => c.json({ ok: true }));

  app.route("/auth", authRoutes(ctx));

  const protectedApp = new Hono<{ Variables: AuthedVars }>();
  protectedApp.use("*", authMiddleware(ctx.jwtSecret));
  protectedApp.route("/incidents", incidentsRoutes(ctx));
  protectedApp.route("/registrations", registrationsRoutes(ctx));
  protectedApp.route("/incidents", mediaRoutes(ctx));
  protectedApp.route("/events", eventsRoutes(ctx));
  protectedApp.route("/push", pushRoutes(ctx));
  app.route("/", protectedApp);

  return app;
}
