import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("migrations", () => {
  it("создают таблицы и позволяют вставку user+house", async () => {
    const u = await makeUser(pg.db, { role: "commander" });
    expect(u.role).toBe("commander");
  });
  it("incidents-таблица существует", async () => {
    const r = await pg.db.execute(sql`select count(*)::int as n from incidents`);
    expect(r[0]).toMatchObject({ n: 0 });
  });
});
