import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { apiFetch, ApiError, Unauthorized } from "../../src/api/client";
import { clear, getAccess, loadRefresh, setTokens } from "../../src/auth/session";

const schema = z.object({ value: z.number() });

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

const isRefresh = (url: string) => url.endsWith("/auth/refresh");

beforeEach(async () => {
  await clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  test("happy path: шлёт Bearer и парсит ответ по схеме", async () => {
    await setTokens({ accessToken: "a1", refreshToken: "r1" });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => json({ value: 42 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("/incidents", { schema });

    expect(result).toEqual({ value: 42 });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer a1");
  });

  test("401 → refresh → повтор успешен, токены ротированы", async () => {
    await setTokens({ accessToken: "old", refreshToken: "r1" });
    let incidentCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (isRefresh(url)) return json({ accessToken: "new", refreshToken: "r2" });
      incidentCalls += 1;
      return incidentCalls === 1 ? json(null, 401) : json({ value: 7 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch("/incidents", { schema });

    expect(result).toEqual({ value: 7 });
    expect(getAccess()).toBe("new");
    expect(await loadRefresh()).toBe("r2");
    expect(fetchMock.mock.calls.filter((c) => isRefresh(c[0] as string))).toHaveLength(1);
  });

  test("refresh не удался → clear + Unauthorized", async () => {
    await setTokens({ accessToken: "old", refreshToken: "r1" });
    const fetchMock = vi.fn(async (url: string) =>
      isRefresh(url) ? json(null, 401) : json(null, 401),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/incidents", { schema })).rejects.toBeInstanceOf(Unauthorized);
    expect(getAccess()).toBeNull();
    expect(await loadRefresh()).toBeNull();
  });

  test("нет refresh-токена → Unauthorized без вызова /auth/refresh", async () => {
    const fetchMock = vi.fn(async (_url: string) => json(null, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/incidents", { schema })).rejects.toBeInstanceOf(Unauthorized);
    expect(fetchMock.mock.calls.some((c) => isRefresh(c[0] as string))).toBe(false);
  });

  test("не-JSON тело при схеме → ApiError, не падение парсера", async () => {
    await setTokens({ accessToken: "a1", refreshToken: "r1" });
    const fetchMock = vi.fn(
      async () =>
        new Response("<html>oops</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiFetch("/incidents", { schema })).rejects.toBeInstanceOf(ApiError);
  });

  test("параллельные 401 делают ровно один refresh (reuse-safe)", async () => {
    await setTokens({ accessToken: "old", refreshToken: "r1" });
    let incidentCalls = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (isRefresh(url)) return json({ accessToken: "new", refreshToken: "r2" });
      incidentCalls += 1;
      return incidentCalls <= 2 ? json(null, 401) : json({ value: incidentCalls });
    });
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([
      apiFetch("/incidents", { schema }),
      apiFetch("/incidents", { schema }),
    ]);

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(fetchMock.mock.calls.filter((c) => isRefresh(c[0] as string))).toHaveLength(1);
  });
});
