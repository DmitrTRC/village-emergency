import { useEffect, useRef } from "react";
import { SseEvent } from "@village/shared";
import { config } from "../config";
import { getAccess } from "../auth/session";

export interface SseTransport {
  open(handlers: { onMessage: (data: string) => void; onError: () => void }): () => void;
}

const MAX_BACKOFF_MS = 30_000;

export function parseSseData(data: string): SseEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  const result = SseEvent.safeParse(json);
  return result.success ? result.data : null;
}

function frameData(frame: string): string | null {
  const lines = frame.split("\n");
  const data = lines
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).replace(/^ /, ""))
    .join("\n");
  return data || null;
}

export function fetchTransport(url: string, getToken: () => string | null): SseTransport {
  return {
    open({ onMessage, onError }) {
      const ctrl = new AbortController();
      void (async () => {
        try {
          const token = getToken();
          const res = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: ctrl.signal,
          });
          if (!res.ok || !res.body) {
            onError();
            return;
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) {
              onError();
              return;
            }
            buf += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buf.indexOf("\n\n")) !== -1) {
              const data = frameData(buf.slice(0, idx));
              buf = buf.slice(idx + 2);
              if (data !== null) onMessage(data);
            }
          }
        } catch {
          if (!ctrl.signal.aborted) onError();
        }
      })();
      return () => ctrl.abort();
    },
  };
}

export function useEventStream(onEvent: (e: SseEvent) => void, transport?: SseTransport): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const t = transport ?? fetchTransport(`${config.apiBase}/events`, getAccess);
    let closed = false;
    let attempt = 0;
    let close: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closed) return;
      close = t.open({
        onMessage: (data) => {
          attempt = 0;
          const ev = parseSseData(data);
          if (ev) handlerRef.current(ev);
        },
        onError: () => {
          close?.();
          close = null;
          if (closed) return;
          const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt);
          attempt += 1;
          timer = setTimeout(connect, delay);
        },
      });
    };

    connect();

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      close?.();
    };
  }, [transport]);
}
