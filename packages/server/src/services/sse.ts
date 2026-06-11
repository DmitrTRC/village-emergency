import postgres from "postgres";
import { SseEvent } from "@village/shared";

const CHANNEL = "incident_events";

export interface SseHub {
  subscribe: (listener: (e: SseEvent) => void) => () => void;
  publish: (e: SseEvent) => Promise<void>;
  close: () => Promise<void>;
}

export async function createSseHub(databaseUrl: string): Promise<SseHub> {
  const listeners = new Set<(e: SseEvent) => void>();
  const sql = postgres(databaseUrl, { max: 1 });

  await sql.listen(CHANNEL, (payload) => {
    const parsed = SseEvent.safeParse(JSON.parse(payload));
    if (parsed.success) for (const l of listeners) l(parsed.data);
  });

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async publish(e) {
      await sql.notify(CHANNEL, JSON.stringify(e));
    },
    async close() {
      listeners.clear();
      await sql.end();
    },
  };
}
