import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { eq } from "drizzle-orm";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import {
  createIncident, acceptIncident, closeIncident, addComment,
} from "../../src/services/incidents.js";
import { incidentEvents, incidentComments } from "../../src/db/schema.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("acceptIncident", () => {
  it("командир принимает offence → public+accepted, событие accepted", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "offence", text: "шум" });
    const r = await acceptIncident(pg.db, cmd, id);
    expect(r.status).toBe("accepted");
    expect(r.visibility).toBe("public");
    const ev = await pg.db.query.incidentEvents.findMany({ where: eq(incidentEvents.incidentId, id) });
    expect(ev.some((e) => e.type === "accepted")).toBe(true);
  });

  it("житель не может принять", async () => {
    const author = await makeUser(pg.db);
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "offence", text: "x" });
    await expect(acceptIncident(pg.db, { id: author.id, role: "resident" }, id)).rejects.toThrow();
  });
});

describe("closeIncident", () => {
  it("close false из delivered делает private", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "attention", text: "ложь" });
    const r = await closeIncident(pg.db, cmd, id, "false");
    expect(r.status).toBe("closed");
    expect(r.visibility).toBe("private");
    expect(r.closeReason).toBe("false");
  });
});

describe("addComment", () => {
  it("в accepted можно, в closed нельзя", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "offence", text: "x" });
    await acceptIncident(pg.db, cmd, id);
    const c = await addComment(pg.db, author, id, "я тоже видел");
    expect(c.text).toBe("я тоже видел");
    const rows = await pg.db.query.incidentComments.findMany({ where: eq(incidentComments.incidentId, id) });
    expect(rows).toHaveLength(1);
    await closeIncident(pg.db, cmd, id, "resolved");
    await expect(addComment(pg.db, author, id, "поздно")).rejects.toThrow();
  });
});
