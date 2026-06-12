import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeHouse, makeUser } from "../helpers/factories.js";
import { buildTestApp, authHeaderFor } from "../helpers/app.js";
import { eq } from "drizzle-orm";
import { registrationRequests } from "../../src/db/schema.js";

let pg: TestPg;
let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => { pg = await startPg(); app = await buildTestApp(pg); });
afterAll(async () => { await app.close(); await pg.stop(); });

describe("registrations moderation", () => {
  it("командир видит pending и одобряет", async () => {
    await makeHouse(pg.db, "Полевая 1");
    await app.ctx.registration.submit({
      telegramUserId: "5551", name: "Сидор", claimedHouseAddress: "Полевая 1", phone: null,
    });
    const cmd = await makeUser(pg.db, { role: "commander" });
    const h = await authHeaderFor(app, cmd.id, "commander");

    const list = await app.fetch(new Request("http://x/registrations", { headers: h }));
    expect(list.status).toBe(200);
    const items = await list.json();
    const req = items.find((r: { telegramUserId: string }) => r.telegramUserId === "5551");
    expect(req).toBeDefined();

    const approve = await app.fetch(new Request(`http://x/registrations/${req.id}/approve`, {
      method: "POST", headers: h,
    }));
    expect(approve.status).toBe(200);

    const row = await pg.db.query.registrationRequests.findFirst({
      where: eq(registrationRequests.id, req.id),
    });
    expect(row?.status).toBe("approved");
  });

  it("житель не имеет доступа к /registrations → 403", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    const res = await app.fetch(new Request("http://x/registrations", { headers: h }));
    expect(res.status).toBe(403);
  });
});
