import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { buildTestApp, authHeaderFor } from "../helpers/app.js";
import { users } from "../../src/db/schema.js";

let pg: TestPg;
let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => { pg = await startPg(); app = await buildTestApp(pg); });
afterAll(async () => { await app.close(); await pg.stop(); });

const subscription = {
  endpoint: "https://push.example/abc",
  expirationTime: null,
  keys: { p256dh: "BPp256dhKey", auth: "authSecret" },
};

describe("push subscription", () => {
  it("сохраняет подписку текущего пользователя", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");

    const res = await app.fetch(new Request("http://x/push/subscription", {
      method: "PUT",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify(subscription),
    }));
    expect(res.status).toBe(200);

    const row = await pg.db.query.users.findFirst({ where: eq(users.id, u.id) });
    expect(row?.pushSubscription).toEqual(subscription);
  });

  it("DELETE очищает подписку", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    await app.fetch(new Request("http://x/push/subscription", {
      method: "PUT",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify(subscription),
    }));

    const res = await app.fetch(new Request("http://x/push/subscription", {
      method: "DELETE", headers: h,
    }));
    expect(res.status).toBe(200);

    const row = await pg.db.query.users.findFirst({ where: eq(users.id, u.id) });
    expect(row?.pushSubscription).toBeNull();
  });

  it("битое тело → 400", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    const res = await app.fetch(new Request("http://x/push/subscription", {
      method: "PUT",
      headers: { ...h, "content-type": "application/json" },
      body: JSON.stringify({ endpoint: "not-a-url" }),
    }));
    expect(res.status).toBe(400);
  });
});
