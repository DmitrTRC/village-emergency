import { beforeEach, describe, expect, test } from "vitest";
import { enqueue, list, markDelivered, remove } from "../../src/db/outbox";
import { resetDbForTests, type OutboxMedia } from "../../src/db/idb";
import type { NewIncidentInput } from "@village/shared";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const M = "33333333-3333-4333-8333-333333333333";

const input = (id: string): NewIncidentInput => ({
  id,
  level: "attention",
  text: "дерево упало на дорогу",
});

const media = (id: string): OutboxMedia => ({
  id,
  blob: new Blob(["x"], { type: "image/webp" }),
  mime: "image/webp",
});

beforeEach(async () => {
  await resetDbForTests();
});

describe("outbox", () => {
  test("enqueue пишет pending-инцидент с медиа и id инцидента", async () => {
    const item = await enqueue(input(A), [media(M)]);

    expect(item.id).toBe(A);
    expect(item.status).toBe("pending");
    expect(item.media).toHaveLength(1);
    expect(typeof item.createdAtClient).toBe("string");
  });

  test("list возвращает все pending-записи", async () => {
    await enqueue(input(A), []);
    await enqueue(input(B), [media(M)]);

    const all = await list();

    expect(all).toHaveLength(2);
    expect(all.map((i) => i.id).sort()).toEqual([A, B]);
  });

  test("markDelivered переводит статус в delivered", async () => {
    await enqueue(input(A), []);

    await markDelivered(A);

    const all = await list();
    expect(all[0]!.status).toBe("delivered");
  });

  test("remove чистит запись", async () => {
    await enqueue(input(A), [media(M)]);

    await remove(A);

    expect(await list()).toHaveLength(0);
  });
});
