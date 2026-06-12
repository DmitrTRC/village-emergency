import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { makeUser } from "../helpers/factories.js";
import { buildTestApp, authHeaderFor } from "../helpers/app.js";

let pg: TestPg;
let app: Awaited<ReturnType<typeof buildTestApp>>;
beforeAll(async () => { pg = await startPg(); app = await buildTestApp(pg); });
afterAll(async () => { await app.close(); await pg.stop(); });

describe("PATCH media uploaded", () => {
  it("автор помечает медиа uploaded", async () => {
    const u = await makeUser(pg.db);
    const h = await authHeaderFor(app, u.id, "resident");
    const incidentId = uuidv7();
    const mediaId = uuidv7();
    await app.fetch(new Request("http://x/incidents", {
      method: "POST", headers: { "content-type": "application/json", ...h },
      body: JSON.stringify({
        id: incidentId, level: "attention", text: "фото",
        media: [{ id: mediaId, kind: "photo", mime: "image/webp", bytes: 5000 }],
      }),
    }));

    const res = await app.fetch(new Request(`http://x/incidents/${incidentId}/media/${mediaId}`, {
      method: "PATCH", headers: { "content-type": "application/json", ...h },
      body: JSON.stringify({ uploaded: true }),
    }));
    expect(res.status).toBe(200);
    expect((await res.json()).uploadStatus).toBe("uploaded");
  });
});
