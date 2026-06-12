import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { createIncident, getIncident, listVisible } from "../../src/services/incidents.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("createIncident", () => {
  it("emergency создаётся public+delivered", async () => {
    const u = await makeUser(pg.db);
    const id = uuidv7();
    const res = await createIncident(pg.db, u.id, {
      id, level: "emergency", text: "Пожар!",
    });
    expect(res.incident.status).toBe("delivered");
    expect(res.incident.visibility).toBe("public");
    expect(res.incident.deliveredAtServer).not.toBeNull();
  });

  it("повторный POST того же UUID идемпотентен", async () => {
    const u = await makeUser(pg.db);
    const id = uuidv7();
    const a = await createIncident(pg.db, u.id, { id, level: "emergency", text: "x" });
    const b = await createIncident(pg.db, u.id, { id, level: "emergency", text: "x" });
    expect(b.incident.id).toBe(a.incident.id);
    const all = await listVisible(pg.db, { id: u.id, role: "resident" });
    expect(all.filter((i) => i.id === id)).toHaveLength(1);
  });

  it("offence создаётся private — другой житель его не видит", async () => {
    const author = await makeUser(pg.db);
    const other = await makeUser(pg.db);
    const id = uuidv7();
    await createIncident(pg.db, author.id, { id, level: "offence", text: "шумят" });
    const seenByOther = await listVisible(pg.db, { id: other.id, role: "resident" });
    expect(seenByOther.find((i) => i.id === id)).toBeUndefined();
    const seenByAuthor = await listVisible(pg.db, { id: author.id, role: "resident" });
    expect(seenByAuthor.find((i) => i.id === id)).toBeDefined();
  });

  it("создаёт media-манифест и возвращает заглушки upload (s3Key проставлен)", async () => {
    const u = await makeUser(pg.db);
    const id = uuidv7();
    const res = await createIncident(pg.db, u.id, {
      id, level: "attention", text: "машина",
      media: [{ id: uuidv7(), kind: "photo", mime: "image/webp", bytes: 100 }],
    });
    expect(res.uploads).toHaveLength(1);
    expect(res.uploads[0]!.s3Key).toContain(id);
  });

  it("пишет incident_events: created+delivered", async () => {
    const u = await makeUser(pg.db);
    const id = uuidv7();
    await createIncident(pg.db, u.id, { id, level: "emergency", text: "x" });
    const inc = await getIncident(pg.db, id);
    expect(inc).not.toBeNull();
  });
});
