import { afterEach, describe, expect, test, vi } from "vitest";
import { captureGeo } from "../../src/geo/capture";

const TS = Date.UTC(2026, 5, 12, 10, 0, 0);

function position(lat: number, lng: number, accuracy: number): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
      toJSON() {
        return this;
      },
    },
    timestamp: TS,
    toJSON() {
      return this;
    },
  } as GeolocationPosition;
}

function setGeolocation(getCurrentPosition: Geolocation["getCurrentPosition"] | undefined) {
  Object.defineProperty(navigator, "geolocation", {
    value: getCurrentPosition ? { getCurrentPosition } : undefined,
    configurable: true,
  });
}

afterEach(() => {
  setGeolocation(undefined);
});

describe("captureGeo", () => {
  test("успех: мапит координаты в shared Geo", async () => {
    setGeolocation((success) => success(position(55.75, 37.61, 12.5)));

    await expect(captureGeo()).resolves.toEqual({
      lat: 55.75,
      lng: 37.61,
      accuracyM: 12.5,
      capturedAt: new Date(TS).toISOString(),
    });
  });

  test("свежая не удалась → возвращает last-known (cached)", async () => {
    const gcp = vi.fn((success: PositionCallback, error?: PositionErrorCallback, opts?: PositionOptions) => {
      if (opts?.maximumAge === Infinity) {
        success(position(55.0, 37.0, 200));
      } else {
        error?.({ code: 3, message: "timeout" } as GeolocationPositionError);
      }
    });
    setGeolocation(gcp);

    await expect(captureGeo()).resolves.toEqual({
      lat: 55.0,
      lng: 37.0,
      accuracyM: 200,
      capturedAt: new Date(TS).toISOString(),
    });
  });

  test("и свежая, и cached не удались → null", async () => {
    setGeolocation((_success, error) =>
      error?.({ code: 1, message: "denied" } as GeolocationPositionError),
    );
    await expect(captureGeo()).resolves.toBeNull();
  });

  test("нет geolocation API → null", async () => {
    setGeolocation(undefined);
    await expect(captureGeo()).resolves.toBeNull();
  });
});
