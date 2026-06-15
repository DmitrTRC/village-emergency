import type { MiddlewareHandler } from "hono";
import { createJwt } from "../auth/jwt.js";
import type { Role } from "@village/shared";
import type { Logger } from "../logger.js";

export interface AuthedVars {
  user: { id: string; role: Role };
  log: Logger;
}

export function authMiddleware(jwtSecret: string): MiddlewareHandler<{ Variables: AuthedVars }> {
  const jwt = createJwt(jwtSecret);
  return async (c, next) => {
    const header = c.req.header("authorization");
    if (!header?.startsWith("Bearer ")) return c.json({ error: "unauthorized" }, 401);
    try {
      const claims = await jwt.verifyAccess(header.slice(7));
      c.set("user", { id: claims.sub, role: claims.role });
    } catch {
      return c.json({ error: "invalid token" }, 401);
    }
    return next();
  };
}

export const errorHandler = (err: Error, c: import("hono").Context) => {
  const status = /forbidden/.test(err.message) ? 403
    : /not found/.test(err.message) ? 404
    : /illegal transition/.test(err.message) ? 409
    : 400;
  return c.json({ error: err.message }, status);
};
