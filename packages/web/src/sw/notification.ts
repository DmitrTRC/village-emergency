export interface PushPayload {
  title: string;
  body: string;
  url: string;
}

export function parsePushPayload(raw: string | null | undefined): PushPayload {
  let data: Partial<PushPayload> = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as Partial<PushPayload>;
    } catch {
      data = {};
    }
  }
  return {
    title: data.title?.trim() || "village-emrg",
    body: data.body ?? "",
    url: data.url || "/",
  };
}

export interface BuiltNotification {
  title: string;
  options: NotificationOptions;
}

export function buildNotification(payload: PushPayload): BuiltNotification {
  return {
    title: payload.title,
    options: {
      body: payload.body,
      tag: payload.url,
      data: { url: payload.url },
    },
  };
}

export function resolveTargetUrl(url: string, origin: string): string {
  try {
    return new URL(url, origin).href;
  } catch {
    return origin;
  }
}
