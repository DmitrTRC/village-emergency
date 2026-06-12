import { afterEach, describe, expect, test, vi } from "vitest";
import type { Incident } from "@village/shared";
import {
  createIncident,
  exchangeToken,
  listIncidents,
  markMediaUploaded,
} from "../../src/api/endpoints";

const incident: Incident = {
  id: "11111111-1111-7111-8111-111111111111",
  authorId: "22222222-2222-7222-8222-222222222222",
  level: "emergency",
  status: "delivered",
  visibility: "public",
  closeReason: null,
  text: "пожар",
  geo: null,
  createdAtClient: "2026-06-12T10:00:00.000Z",
  deliveredAtServer: "2026-06-12T10:00:01.000Z",
  acceptedAt: null,
  closedAt: null,
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("endpoints", () => {
  test("listIncidents парсит Incident[]", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json([incident])));
    await expect(listIncidents()).resolves.toEqual([incident]);
  });

  test("createIncident возвращает incident + uploads", async () => {
    const payload = {
      incident,
      uploads: [
        {
          mediaId: "33333333-3333-7333-8333-333333333333",
          url: "https://s3.example/put?sig=abc",
          s3Key: "incidents/2026/06/x/y.webp",
        },
      ],
    };
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json(payload, 201));
    vi.stubGlobal("fetch", fetchMock);

    const res = await createIncident({ id: incident.id, level: "emergency" });

    expect(res.incident.id).toBe(incident.id);
    expect(res.uploads).toHaveLength(1);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
  });

  test("exchangeToken парсит токены и user", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          accessToken: "a1",
          refreshToken: "r1",
          user: { id: incident.authorId, name: "Дмитрий", role: "commander" },
        }),
      ),
    );

    const res = await exchangeToken("nonce-xyz");
    expect(res.accessToken).toBe("a1");
    expect(res.user.role).toBe("commander");
  });

  test("markMediaUploaded шлёт PATCH и парсит uploadStatus", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      json({ uploadStatus: "uploaded" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await markMediaUploaded(incident.id, "44444444-4444-7444-8444-444444444444");

    expect(res.uploadStatus).toBe("uploaded");
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("PATCH");
  });
});
