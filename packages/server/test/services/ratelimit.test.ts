import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { createIncident } from "../../src/services/incidents.js";
import { checkIncidentRate } from "../../src/services/ratelimit.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("checkIncidentRate", () => {
  it("разрешает при отсутствии истории", async () => {
    const u = await makeUser(pg.db);
    const r = await checkIncidentRate(pg.db, u.id, "emergency");
    expect(r.allowed).toBe(true);
  });

  it("блокирует 6-й emergency в течение часа", async () => {
    const u = await makeUser(pg.db);
    for (let n = 0; n < 5; n++) {
      await createIncident(pg.db, u.id, { id: uuidv7(), level: "emergency", text: "x" });
    }
    const r = await checkIncidentRate(pg.db, u.id, "emergency");
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain("emergency");
  });
});
