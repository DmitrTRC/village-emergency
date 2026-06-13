import type { NewIncidentInput } from "@village/shared";
import { getDb, type OutboxItem, type OutboxMedia } from "./idb";

export async function enqueue(
  input: NewIncidentInput,
  media: OutboxMedia[],
): Promise<OutboxItem> {
  const item: OutboxItem = {
    id: input.id,
    input,
    media,
    status: "pending",
    createdAtClient: new Date().toISOString(),
  };
  await (await getDb()).put("outbox", item);
  await requestSync(item.id);
  return item;
}

export async function list(): Promise<OutboxItem[]> {
  return (await getDb()).getAll("outbox");
}

export async function markDelivered(id: string): Promise<void> {
  const db = await getDb();
  const item = await db.get("outbox", id);
  if (!item) return;
  await db.put("outbox", { ...item, status: "delivered" });
}

export async function remove(id: string): Promise<void> {
  await (await getDb()).delete("outbox", id);
}

export async function requestSync(id: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sync = (reg as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } })
      .sync;
    if (!sync) return false;
    await sync.register(`incident:${id}`);
    return true;
  } catch {
    return false;
  }
}
