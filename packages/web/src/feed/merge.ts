import type { Incident, IncidentLevel, IncidentStatus, Visibility } from "@village/shared";
import type { OutboxItem } from "../db/idb";

export interface FeedItem {
  id: string;
  level: IncidentLevel;
  status: IncidentStatus | "pending";
  visibility: Visibility | null;
  text: string | null;
  createdAt: string;
  pending: boolean;
}

function fromIncident(i: Incident): FeedItem {
  return {
    id: i.id,
    level: i.level,
    status: i.status,
    visibility: i.visibility,
    text: i.text,
    createdAt: i.createdAtClient,
    pending: false,
  };
}

function fromOutbox(o: OutboxItem): FeedItem {
  const input = o.input as { level: IncidentLevel; text?: string | null };
  return {
    id: o.id,
    level: input.level,
    status: "pending",
    visibility: null,
    text: input.text ?? null,
    createdAt: o.createdAtClient,
    pending: true,
  };
}

export function mergeFeed(incidents: Incident[], outbox: OutboxItem[]): FeedItem[] {
  const serverIds = new Set(incidents.map((i) => i.id));
  const pending = outbox
    .filter((o) => o.status === "pending" && !serverIds.has(o.id))
    .map(fromOutbox);
  return [...incidents.map(fromIncident), ...pending].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
