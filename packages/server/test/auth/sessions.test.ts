import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { createSessionService } from "../../src/auth/sessions.js";
import { sessions } from "../../src/db/schema.js";

let pg: TestPg;
const secret = "x".repeat(64);
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("sessions", () => {
  it("issue выдаёт access+refresh", async () => {
    const u = await makeUser(pg.db);
    const svc = createSessionService(pg.db, secret);
    const pair = await svc.issue(u.id, u.role);
    expect(pair.accessToken).toBeTruthy();
    expect(pair.refreshToken).toBeTruthy();
  });

  it("rotate выдаёт новый refresh, старый больше не работает", async () => {
    const u = await makeUser(pg.db);
    const svc = createSessionService(pg.db, secret);
    const first = await svc.issue(u.id, u.role);
    const second = await svc.rotate(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    await expect(svc.rotate(first.refreshToken)).rejects.toThrow();
  });

  it("повторное использование старого refresh инвалидирует все сессии user", async () => {
    const u = await makeUser(pg.db);
    const svc = createSessionService(pg.db, secret);
    const first = await svc.issue(u.id, u.role);
    const second = await svc.rotate(first.refreshToken);
    await svc.rotate(first.refreshToken).catch(() => {});
    await expect(svc.rotate(second.refreshToken)).rejects.toThrow();
    const rows = await pg.db.query.sessions.findMany({ where: eq(sessions.userId, u.id) });
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
  });
});
