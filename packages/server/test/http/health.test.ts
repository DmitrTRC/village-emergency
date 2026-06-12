import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, type TestPg } from "../helpers/pg.js";
import { buildTestApp } from "../helpers/app.js";

let pg: TestPg;
let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => { pg = await startPg(); app = await buildTestApp(pg); });
afterAll(async () => { await app.close(); await pg.stop(); });

describe("health", () => {
  it("GET /health → 200 ok", async () => {
    const res = await app.fetch(new Request("http://x/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("защищённый роут без токена → 401", async () => {
    const res = await app.fetch(new Request("http://x/incidents"));
    expect(res.status).toBe(401);
  });
});
