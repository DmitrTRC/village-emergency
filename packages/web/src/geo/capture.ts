import type { Geo } from "@village/shared";

const TIMEOUT_MS = 5000;

function getPosition(options: PositionOptions): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      () => resolve(null),
      options,
    );
  });
}

function toGeo(pos: GeolocationPosition): Geo {
  return {
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    accuracyM: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
    capturedAt: new Date(pos.timestamp).toISOString(),
  };
}

export async function captureGeo(): Promise<Geo | null> {
  const fresh = await getPosition({ enableHighAccuracy: true, timeout: TIMEOUT_MS });
  if (fresh) return toGeo(fresh);

  const cached = await getPosition({ maximumAge: Infinity, timeout: 0 });
  return cached ? toGeo(cached) : null;
}
