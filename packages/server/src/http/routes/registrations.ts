import { Hono } from "hono";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";

export function registrationsRoutes(_ctx: AppContext) {
  return new Hono<{ Variables: AuthedVars }>();
}
