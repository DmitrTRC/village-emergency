import { Hono } from "hono";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";

export function authRoutes(_ctx: AppContext) {
  return new Hono<{ Variables: AuthedVars }>();
}
