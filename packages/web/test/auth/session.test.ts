import { beforeEach, describe, expect, test, vi } from "vitest";

const importSession = () => import("../../src/auth/session");

beforeEach(async () => {
  const session = await importSession();
  await session.clear();
});

describe("session", () => {
  test("setTokens кладёт access в память, refresh в IDB", async () => {
    const session = await importSession();
    await session.setTokens({ accessToken: "a1", refreshToken: "r1" });

    expect(session.getAccess()).toBe("a1");
    expect(await session.loadRefresh()).toBe("r1");
  });

  test("clear чистит и память, и IDB", async () => {
    const session = await importSession();
    await session.setTokens({ accessToken: "a1", refreshToken: "r1" });
    await session.clear();

    expect(session.getAccess()).toBeNull();
    expect(await session.loadRefresh()).toBeNull();
  });

  test("без токенов getAccess=null, loadRefresh=null", async () => {
    const session = await importSession();
    expect(session.getAccess()).toBeNull();
    expect(await session.loadRefresh()).toBeNull();
  });

  test("refresh переживает перезапуск (новый импорт), access — нет", async () => {
    const s1 = await importSession();
    await s1.setTokens({ accessToken: "a1", refreshToken: "r1" });

    const { closeDb } = await import("../../src/db/idb");
    await closeDb();
    vi.resetModules();

    const s2 = await importSession();
    expect(s2.getAccess()).toBeNull();
    expect(await s2.loadRefresh()).toBe("r1");
  });
});
