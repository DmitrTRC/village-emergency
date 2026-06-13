import type { NewIncidentInput } from "@village/shared";
import { createIncident, markMediaUploaded } from "../api/endpoints";
import type { OutboxItem } from "./idb";
import { list, markDelivered } from "./outbox";

let draining: Promise<void> | null = null;

export function drainOutbox(): Promise<void> {
  if (!draining) {
    draining = run().finally(() => {
      draining = null;
    });
  }
  return draining;
}

async function run(): Promise<void> {
  for (const item of await list()) {
    if (item.status === "delivered") continue;
    try {
      await deliver(item);
      await markDelivered(item.id);
    } catch {
      // оставляем pending — повторим при следующем online
    }
  }
}

async function deliver(item: OutboxItem): Promise<void> {
  const { uploads } = await createIncident(item.input as NewIncidentInput);
  for (const up of uploads) {
    const media = item.media.find((m) => m.id === up.mediaId);
    if (!media) continue;
    const res = await fetch(up.url, {
      method: "PUT",
      headers: { "content-type": media.mime },
      body: media.blob,
    });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
    await markMediaUploaded(item.id, up.mediaId);
  }
}
