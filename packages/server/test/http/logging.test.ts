import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { pino, stdSerializers } from "pino";
import { requestLogger } from "../../src/http/logging.js";
import type { AuthedVars } from "../../src/http/middleware.js";
import { errorHandler } from "../../src/http/middleware.js";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = { write: (s: string) => lines.push(JSON.parse(s)) };
  const logger = pino(
    { level: "info", serializers: { err: stdSerializers.err } },
    stream as unknown as import("pino").DestinationStream,
  );
  return { logger, lines };
}

describe("requestLogger", () => {
  it("пишет одну строку с method/path/status/ms/reqId", async () => {
    const { logger, lines } = capture();
    const app = new Hono<{ Variables: AuthedVars }>();
    app.use(requestLogger(logger));
    app.get("/x", (c) => c.text("ok"));

    const res = await app.fetch(new Request("http://h/x"));

    expect(res.status).toBe(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ method: "GET", path: "/x", status: 200, msg: "request" });
    expect(typeof lines[0]!.reqId).toBe("string");
    expect(typeof lines[0]!.ms).toBe("number");
  });
});

describe("errorHandler", () => {
  it("логирует ошибку (level 50) и сохраняет HTTP-контракт", async () => {
    const { logger, lines } = capture();
    const app = new Hono<{ Variables: AuthedVars }>();
    app.onError(errorHandler);
    app.use(requestLogger(logger));
    app.get("/boom", () => { throw new Error("not found: thing"); });

    const res = await app.fetch(new Request("http://h/boom"));

    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "not found: thing" });
    const errLine = lines.find((l) => l.level === 50);
    expect(errLine).toBeTruthy();
    expect((errLine!.err as { message: string }).message).toBe("not found: thing");
  });
});
