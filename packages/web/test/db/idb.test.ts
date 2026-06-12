import { beforeEach, describe, expect, test } from "vitest";
import type { Incident } from "@village/shared";
import {
  closeDb,
  getDb,
  resetDbForTests,
  type OutboxItem,
} from "../../src/db/idb";

const incident: Incident = {
  id: "11111111-1111-7111-8111-111111111111",
  authorId: "22222222-2222-7222-8222-222222222222",
  level: "attention",
  status: "delivered",
  visibility: "public",
  closeReason: null,
  text: "машина у ворот",
  geo: null,
  createdAtClient: "2026-06-12T10:00:00.000Z",
  deliveredAtServer: "2026-06-12T10:00:01.000Z",
  acceptedAt: null,
  closedAt: null,
};

const outboxItem: OutboxItem = {
  id: incident.id,
  input: { id: incident.id, level: "attention", text: "машина у ворот" },
  media: [],
  status: "pending",
  createdAtClient: incident.createdAtClient,
};

beforeEach(async () => {
  await resetDbForTests();
});

describe("idb", () => {
  test("outbox: put/get/delete", async () => {
    const db = await getDb();
    await db.put("outbox", outboxItem);
    expect(await db.get("outbox", outboxItem.id)).toEqual(outboxItem);
    await db.delete("outbox", outboxItem.id);
    expect(await db.get("outbox", outboxItem.id)).toBeUndefined();
  });

  test("incidents: put/get/getAll", async () => {
    const db = await getDb();
    await db.put("incidents", incident);
    expect(await db.get("incidents", incident.id)).toEqual(incident);
    expect(await db.getAll("incidents")).toEqual([incident]);
    await db.delete("incidents", incident.id);
    expect(await db.get("incidents", incident.id)).toBeUndefined();
  });

  test("tokens: put/get/delete", async () => {
    const db = await getDb();
    await db.put("tokens", { key: "refresh", value: "refresh-jwt" });
    expect(await db.get("tokens", "refresh")).toEqual({
      key: "refresh",
      value: "refresh-jwt",
    });
    await db.delete("tokens", "refresh");
    expect(await db.get("tokens", "refresh")).toBeUndefined();
  });

  test("переоткрытие сохраняет данные, апгрейд идемпотентен", async () => {
    const db1 = await getDb();
    await db1.put("tokens", { key: "refresh", value: "r1" });
    await closeDb();

    const db2 = await getDb();
    expect(await db2.get("tokens", "refresh")).toEqual({
      key: "refresh",
      value: "r1",
    });
  });
});
