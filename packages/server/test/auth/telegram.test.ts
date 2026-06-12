import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { issueLoginNonce, consumableNonceExists } from "../../src/auth/telegram.js";
import { loginNonces } from "../../src/db/schema.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("login nonce", () => {
  it("issueLoginNonce создаёт nonce, привязанный к telegram_user_id", async () => {
    const u = await makeUser(pg.db, { tg: "9001" });
    const nonce = await issueLoginNonce(pg.db, "9001");
    expect(nonce).toBeTruthy();
    const row = await pg.db.query.loginNonces.findFirst({ where: eq(loginNonces.nonce, nonce) });
    expect(row?.telegramUserId).toBe("9001");
    expect(row?.usedAt).toBeNull();
  });

  it("consumableNonceExists true для свежего, false для просроченного", async () => {
    const nonce = await issueLoginNonce(pg.db, "9002");
    expect(await consumableNonceExists(pg.db, nonce)).toBe(true);
    expect(await consumableNonceExists(pg.db, "no-such")).toBe(false);
  });
});
