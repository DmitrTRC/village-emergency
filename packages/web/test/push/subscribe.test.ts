import { afterEach, describe, expect, test, vi } from "vitest";

const h = vi.hoisted(() => ({ savePushSubscription: vi.fn() }));
vi.mock("../../src/api/endpoints", () => ({ savePushSubscription: h.savePushSubscription }));
vi.mock("../../src/config", () => ({ config: { apiBase: "", vapidPublicKey: "AAAA" } }));

import {
  subscribePush,
  toSubscriptionDTO,
  urlBase64ToUint8Array,
} from "../../src/push/subscribe";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("urlBase64ToUint8Array", () => {
  test("декодирует стандартный base64", () => {
    expect(Array.from(urlBase64ToUint8Array("AAAA"))).toEqual([0, 0, 0]);
  });

  test("обрабатывает url-safe символы - и _", () => {
    expect(Array.from(urlBase64ToUint8Array("____"))).toEqual([255, 255, 255]);
  });

  test("дополняет паддинг", () => {
    expect(Array.from(urlBase64ToUint8Array("AA"))).toEqual([0]);
  });
});

describe("toSubscriptionDTO", () => {
  test("формирует тело из PushSubscription.toJSON", () => {
    const sub = {
      expirationTime: 123,
      toJSON: () => ({
        endpoint: "https://push.example/x",
        keys: { p256dh: "pk", auth: "ak" },
      }),
    } as unknown as PushSubscription;

    expect(toSubscriptionDTO(sub)).toEqual({
      endpoint: "https://push.example/x",
      expirationTime: 123,
      keys: { p256dh: "pk", auth: "ak" },
    });
  });

  test("бросает при неполной подписке", () => {
    const sub = { toJSON: () => ({ endpoint: "https://x", keys: {} }) } as unknown as PushSubscription;
    expect(() => toSubscriptionDTO(sub)).toThrow();
  });
});

describe("subscribePush", () => {
  const fakeSub = {
    expirationTime: null,
    toJSON: () => ({ endpoint: "https://push.example/x", keys: { p256dh: "pk", auth: "ak" } }),
  } as unknown as PushSubscription;

  function stubEnv(permission: NotificationPermission, subscribe: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue(permission) });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe },
        }),
      },
    });
  }

  test("granted → подписывается и шлёт подписку на сервер", async () => {
    const subscribe = vi.fn().mockResolvedValue(fakeSub);
    stubEnv("granted", subscribe);
    h.savePushSubscription.mockResolvedValue({ ok: true });

    await expect(subscribePush()).resolves.toBe(true);
    expect(subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(h.savePushSubscription).toHaveBeenCalledWith({
      endpoint: "https://push.example/x",
      expirationTime: null,
      keys: { p256dh: "pk", auth: "ak" },
    });
  });

  test("denied → false, на сервер ничего не шлём", async () => {
    const subscribe = vi.fn();
    stubEnv("denied", subscribe);

    await expect(subscribePush()).resolves.toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
    expect(h.savePushSubscription).not.toHaveBeenCalled();
  });
});
