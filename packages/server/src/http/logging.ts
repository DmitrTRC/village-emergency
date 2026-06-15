import type { MiddlewareHandler } from "hono";
import { log, type Logger } from "../logger.js";
import type { AuthedVars } from "./middleware.js";

export function requestLogger(logger: Logger = log): MiddlewareHandler<{ Variables: AuthedVars }> {
  return async (c, next) => {
    const reqId = crypto.randomUUID();
    const child = logger.child({ reqId });
    c.set("log", child);
    const start = performance.now();
    await next();
    child.info(
      { method: c.req.method, path: c.req.path, status: c.res.status, ms: Math.round(performance.now() - start) },
      "request",
    );
  };
}
