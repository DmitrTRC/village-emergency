import { describe, expect, test } from "vitest";
import type { Incident } from "@village/shared";
import type { OutboxItem } from "../../src/db/idb";
import { mergeFeed } from "../../src/feed/merge";

const incident = (over: Partial<Incident> & { id: string; createdAtClient: string }): Incident => ({
  authorId: "00000000-0000-4000-8000-000000000000",
  level: "attention",
  status: "delivered",
  visibility: "public",
  closeReason: null,
  text: "txt",
  geo: null,
  deliveredAtServer: null,
  acceptedAt: null,
  closedAt: null,
  ...over,
});

const outbox = (id: string, createdAtClient: string, status: OutboxItem["status"]): OutboxItem => ({
  id,
  input: { id, level: "emergency", text: "горит" },
  media: [],
  status,
  createdAtClient,
});

describe("mergeFeed", () => {
  test("сортирует по времени убыванию и помечает pending", () => {
    const items = mergeFeed(
      [incident({ id: "s1", createdAtClient: "2026-06-13T10:00:00.000Z" })],
      [outbox("o1", "2026-06-13T11:00:00.000Z", "pending")],
    );
    expect(items.map((i) => i.id)).toEqual(["o1", "s1"]);
    expect(items[0]!).toMatchObject({ pending: true, status: "pending", level: "emergency" });
    expect(items[1]!.pending).toBe(false);
  });

  test("delivered-outbox не показывается как pending", () => {
    const items = mergeFeed([], [outbox("o1", "2026-06-13T11:00:00.000Z", "delivered")]);
    expect(items).toHaveLength(0);
  });

  test("дубль по id: серверная запись вытесняет outbox", () => {
    const items = mergeFeed(
      [incident({ id: "dup", createdAtClient: "2026-06-13T10:00:00.000Z" })],
      [outbox("dup", "2026-06-13T11:00:00.000Z", "pending")],
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.pending).toBe(false);
  });
});
