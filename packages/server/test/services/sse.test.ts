import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { uuidv7 } from "uuidv7";
import { startPg, type TestPg } from "../helpers/pg.js";
import { createSseHub } from "../../src/services/sse.js";

let pg: TestPg;
beforeAll(async () => { pg = await startPg(); });
afterAll(async () => { await pg.stop(); });

describe("SseHub", () => {
  it("доставляет notify подписчику", async () => {
    const hub = await createSseHub(pg.url);
    const got: unknown[] = [];
    const unsub = hub.subscribe((e) => got.push(e));
    const id = uuidv7();
    await hub.publish({ type: "incident.delivered", id });
    await new Promise((r) => setTimeout(r, 300));
    expect(got).toContainEqual({ type: "incident.delivered", id });
    unsub();
    await hub.close();
  });
});
