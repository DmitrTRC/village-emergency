import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { AppContext } from "../context.js";
import type { AuthedVars } from "../middleware.js";

export function eventsRoutes(ctx: AppContext) {
  const app = new Hono<{ Variables: AuthedVars }>();

  app.get("/", (c) =>
    streamSSE(c, async (stream) => {
      const queue: string[] = [];
      const unsub = ctx.sse.subscribe((e) => queue.push(JSON.stringify(e)));
      try {
        while (!stream.closed) {
          while (queue.length) await stream.writeSSE({ data: queue.shift()! });
          await stream.sleep(500);
        }
      } finally {
        unsub();
      }
    }),
  );

  return app;
}
