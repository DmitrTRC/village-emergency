import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { buildTestApp, authHeaderFor } from "../helpers/app.js";

let pg: TestPg;
let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => { pg = await startPg(); app = await buildTestApp(pg); });
afterAll(async () => { await app.close(); await pg.stop(); });

function post(path: string, headers: Record<string, string>, body: unknown) {
  return app.fetch(new Request(`http://x${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }));
}

describe("POST /incidents", () => {
  it("создаёт emergency и возвращает incident+uploads", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    const res = await post("/incidents", h, { id: uuidv7(), level: "emergency", text: "Пожар" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.incident.visibility).toBe("public");
    expect(Array.isArray(body.uploads)).toBe(true);
  });

  it("отвергает attention без текста/медиа/гео → 400", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    const res = await post("/incidents", h, { id: uuidv7(), level: "attention" });
    expect(res.status).toBe(400);
  });

  it("rate-limit: 6-й emergency → 429", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    for (let n = 0; n < 5; n++) {
      await post("/incidents", h, { id: uuidv7(), level: "emergency", text: "x" });
    }
    const res = await post("/incidents", h, { id: uuidv7(), level: "emergency", text: "x" });
    expect(res.status).toBe(429);
  });
});

describe("incident transitions", () => {
  it("командир accept → 200 accepted; житель accept → 403", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await post("/incidents", await authHeaderFor(app, author.id, "resident"), { id, level: "offence", text: "шум" });

    const forbidden = await post(`/incidents/${id}/accept`, await authHeaderFor(app, author.id, "resident"), {});
    expect(forbidden.status).toBe(403);

    const ok = await post(`/incidents/${id}/accept`, await authHeaderFor(app, cmd.id, "commander"), {});
    expect(ok.status).toBe(200);
    expect((await ok.json()).status).toBe("accepted");
  });

  it("close false → 200, инцидент исчезает из ленты другого жителя", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const other = await makeUser(pg.db);
    const id = uuidv7();
    await post("/incidents", await authHeaderFor(app, author.id, "resident"), { id, level: "attention", text: "ложь" });
    await post(`/incidents/${id}/close`, await authHeaderFor(app, cmd.id, "commander"), { reason: "false" });

    const list = await app.fetch(new Request("http://x/incidents", {
      headers: await authHeaderFor(app, other.id, "resident"),
    }));
    const items = await list.json();
    expect(items.find((i: { id: string }) => i.id === id)).toBeUndefined();
  });

  it("комментарий в accepted → 201, в closed → 403", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await post("/incidents", await authHeaderFor(app, author.id, "resident"), { id, level: "offence", text: "x" });
    await post(`/incidents/${id}/accept`, await authHeaderFor(app, cmd.id, "commander"), {});
    const ok = await post(`/incidents/${id}/comments`, await authHeaderFor(app, author.id, "resident"), { text: "видел" });
    expect(ok.status).toBe(201);
    await post(`/incidents/${id}/close`, await authHeaderFor(app, cmd.id, "commander"), { reason: "resolved" });
    const late = await post(`/incidents/${id}/comments`, await authHeaderFor(app, author.id, "resident"), { text: "поздно" });
    expect(late.status).toBe(403);
  });
});

describe("GET /incidents/:id/thread", () => {
  it("отдаёт таймлайн событий и комментарии автору", async () => {
    const author = await makeUser(pg.db);
    const cmd = await makeUser(pg.db, { role: "commander" });
    const id = uuidv7();
    await post("/incidents", await authHeaderFor(app, author.id, "resident"), { id, level: "offence", text: "шум" });
    await post(`/incidents/${id}/accept`, await authHeaderFor(app, cmd.id, "commander"), {});
    await post(`/incidents/${id}/comments`, await authHeaderFor(app, author.id, "resident"), { text: "видел" });

    const res = await app.fetch(new Request(`http://x/incidents/${id}/thread`, {
      headers: await authHeaderFor(app, author.id, "resident"),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(["created", "delivered", "accepted", "commented"]),
    );
    expect(body.comments).toHaveLength(1);
    expect(body.comments[0].text).toBe("видел");
    expect(Array.isArray(body.media)).toBe(true);
  });

  it("private инцидент → 403 чужому жителю", async () => {
    const author = await makeUser(pg.db);
    const other = await makeUser(pg.db);
    const id = uuidv7();
    await post("/incidents", await authHeaderFor(app, author.id, "resident"), { id, level: "offence", text: "тихо" });
    const res = await app.fetch(new Request(`http://x/incidents/${id}/thread`, {
      headers: await authHeaderFor(app, other.id, "resident"),
    }));
    expect(res.status).toBe(403);
  });
});
