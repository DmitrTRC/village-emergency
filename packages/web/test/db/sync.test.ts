import { beforeEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({
  createIncident: vi.fn(),
  markMediaUploaded: vi.fn(),
}));
vi.mock("../../src/api/endpoints", () => ({
  createIncident: h.createIncident,
  markMediaUploaded: h.markMediaUploaded,
}));

import { drainOutbox } from "../../src/db/sync";
import { enqueue, list } from "../../src/db/outbox";
import { resetDbForTests, type OutboxMedia } from "../../src/db/idb";
import type { NewIncidentInput } from "@village/shared";

const A = "11111111-1111-4111-8111-111111111111";
const MID = "33333333-3333-4333-8333-333333333333";

const input = (id: string): NewIncidentInput => ({
  id,
  level: "attention",
  text: "дерево на дороге",
});

const media = (id: string): OutboxMedia => ({
  id,
  blob: new Blob(["x"], { type: "image/webp" }),
  mime: "image/webp",
});

interface Upload {
  mediaId: string;
  url: string;
  s3Key: string;
}

const ok = (i: NewIncidentInput, uploads: Upload[] = []) => ({
  incident: { id: i.id },
  uploads,
});

beforeEach(async () => {
  await resetDbForTests();
  h.createIncident.mockReset();
  h.markMediaUploaded.mockReset();
});

describe("drainOutbox", () => {
  test("доставляет pending-инцидент и помечает delivered", async () => {
    await enqueue(input(A), []);
    h.createIncident.mockResolvedValue(ok(input(A)));

    await drainOutbox();

    expect(h.createIncident).toHaveBeenCalledTimes(1);
    expect(h.createIncident.mock.calls[0]![0]).toMatchObject({ id: A, level: "attention" });
    expect((await list())[0]!.status).toBe("delivered");
  });

  test("при ошибке оставляет инцидент pending", async () => {
    await enqueue(input(A), []);
    h.createIncident.mockRejectedValue(new Error("network"));

    await drainOutbox();

    expect((await list())[0]!.status).toBe("pending");
  });

  test("загружает медиа по presigned PUT и помечает media uploaded", async () => {
    await enqueue(input(A), [media(MID)]);
    h.createIncident.mockResolvedValue(
      ok(input(A), [{ mediaId: MID, url: "https://s3.example.com/put", s3Key: "k" }]),
    );
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await drainOutbox();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://s3.example.com/put",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(h.markMediaUploaded).toHaveBeenCalledWith(A, MID);
    expect((await list())[0]!.status).toBe("delivered");
    vi.unstubAllGlobals();
  });

  test("уже доставленные пропускает", async () => {
    await enqueue(input(A), []);
    h.createIncident.mockResolvedValue(ok(input(A)));
    await drainOutbox();
    h.createIncident.mockClear();

    await drainOutbox();

    expect(h.createIncident).not.toHaveBeenCalled();
  });

  test("параллельные вызовы дедуплицируются в один проход", async () => {
    await enqueue(input(A), []);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    h.createIncident.mockImplementation(async () => {
      await gate;
      return ok(input(A));
    });

    const p1 = drainOutbox();
    const p2 = drainOutbox();
    release();
    await Promise.all([p1, p2]);

    expect(h.createIncident).toHaveBeenCalledTimes(1);
  });
});
